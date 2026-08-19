// Generates src/types/database.ts from a live Postgres schema.
//
// `supabase gen types typescript` needs Docker, which this project does not
// use and which is not available in CI here. This reads the same catalog
// tables through psql and emits the same `Database` shape, so the output drops
// straight into @supabase/supabase-js:
//
//   const sb = createClient<Database>(url, key)
//
// Point it at anything with the schema applied — the throwaway database from
// scripts/test-onboarding-rls.mjs, a Supabase development branch, or the live
// project (read-only; it only reads catalogs).
//
//   node scripts/gen-db-types.mjs "postgresql://user@host:5432/db" [outfile]

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CONN = process.argv[2];
const OUT = process.argv[3] || 'src/types/database.ts';
if (!CONN) {
  console.error('usage: node scripts/gen-db-types.mjs <connection-string> [outfile]');
  process.exit(1);
}

const PSQL = process.env.PSQL || 'psql';

function query(sql) {
  const out = execFileSync(PSQL, [CONN, '-X', '-t', '-A', '-F', '\t', '-c', sql], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map((l) => l.split('\t'));
}

// ---- Postgres type -> TypeScript -------------------------------------------
function tsType(dataType, udtName) {
  if (dataType === 'ARRAY') return `${tsType(null, udtName.replace(/^_/, ''))}[]`;
  switch (udtName) {
    case 'bool':                                      return 'boolean';
    case 'int2': case 'int4': case 'int8':
    case 'numeric': case 'float4': case 'float8':     return 'number';
    case 'json': case 'jsonb':                        return 'Json';
    default:                                          return 'string';
  }
}

// ---- Catalog ---------------------------------------------------------------
// A column whose COMMENT starts with "derived:" is written by a BEFORE trigger
// and any caller-supplied value is discarded, so it is optional on insert even
// though it is NOT NULL with no default.
const columns = query(`
  select t.table_type, c.table_name, c.column_name, c.data_type, c.udt_name,
         c.is_nullable, coalesce(c.column_default, ''), coalesce(c.is_generated, 'NEVER'),
         case when col_description(
                (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
                c.ordinal_position) like 'derived:%' then 'YES' else 'NO' end
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
   order by t.table_type desc, c.table_name, c.ordinal_position
`);

const foreignKeys = query(`
  select cl.relname, con.conname, fcl.relname,
         (select string_agg(a.attname, ',' order by k.ord)
            from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
         (select string_agg(a.attname, ',' order by k.ord)
            from unnest(con.confkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum),
         (select count(*) > 0
            from pg_index i
           where i.indrelid = con.conrelid and i.indisunique
             and i.indnatts = cardinality(con.conkey)
             and i.indkey::int2[] @> con.conkey and con.conkey @> i.indkey::int2[])
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class fcl on fcl.oid = con.confrelid
    join pg_namespace n on n.oid = cl.relnamespace
   where con.contype = 'f' and n.nspname = 'public'
   order by cl.relname, con.conname
`);

const functions = query(`
  select p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and pg_get_function_result(p.oid) <> 'trigger'
   order by p.proname
`);

// ---- Shape it --------------------------------------------------------------
const relations = new Map(); // table -> Row/Insert/Update fields
for (const [tableType, table, name, dataType, udt, nullable, dflt, generated, derived] of columns) {
  if (!relations.has(table)) {
    relations.set(table, { isView: tableType === 'VIEW', columns: [] });
  }
  relations.get(table).columns.push({
    name,
    type: tsType(dataType, udt),
    nullable: nullable === 'YES',
    hasDefault: dflt !== '' || generated !== 'NEVER' || derived === 'YES',
    generated: generated !== 'NEVER',
  });
}

const fksByTable = new Map();
for (const [table, name, refTable, cols, refCols, oneToOne] of foreignKeys) {
  if (!fksByTable.has(table)) fksByTable.set(table, []);
  fksByTable.get(table).push({
    name,
    columns: cols.split(','),
    refTable,
    refColumns: refCols.split(','),
    oneToOne: oneToOne === 't',
  });
}

const q = (s) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s));
const arr = (xs) => `[${xs.map((x) => JSON.stringify(x)).join(', ')}]`;

function block(rel, kind) {
  const lines = rel.columns.map((c) => {
    if (kind === 'Row') return `          ${q(c.name)}: ${c.type}${c.nullable ? ' | null' : ''}`;
    if (kind === 'Insert') {
      if (c.generated) return null;
      const optional = c.nullable || c.hasDefault;
      return `          ${q(c.name)}${optional ? '?' : ''}: ${c.type}${c.nullable ? ' | null' : ''}`;
    }
    if (c.generated) return null;
    return `          ${q(c.name)}?: ${c.type}${c.nullable ? ' | null' : ''}`;
  }).filter(Boolean);
  return lines.join('\n');
}

function relationships(table) {
  const fks = fksByTable.get(table) || [];
  if (!fks.length) return '        Relationships: []';
  const entries = fks.map((fk) => [
    '          {',
    `            foreignKeyName: ${JSON.stringify(fk.name)}`,
    `            columns: ${arr(fk.columns)}`,
    `            isOneToOne: ${fk.oneToOne}`,
    `            referencedRelation: ${JSON.stringify(fk.refTable)}`,
    `            referencedColumns: ${arr(fk.refColumns)}`,
    '          },',
  ].join('\n')).join('\n');
  return `        Relationships: [\n${entries}\n        ]`;
}

function renderRelations(isView) {
  const names = [...relations.keys()].filter((t) => relations.get(t).isView === isView).sort();
  if (!names.length) return '';
  return names.map((t) => {
    const rel = relations.get(t);
    const parts = [
      `      ${q(t)}: {`,
      `        Row: {\n${block(rel, 'Row')}\n        }`,
    ];
    if (!isView) {
      parts.push(`        Insert: {\n${block(rel, 'Insert')}\n        }`);
      parts.push(`        Update: {\n${block(rel, 'Update')}\n        }`);
    }
    parts.push(relationships(t));
    parts.push('      }');
    return parts.join('\n');
  }).join('\n');
}

// Argument lists come back as "a text, b integer DEFAULT 5"; good enough to
// type the RPC surface, which is all any caller needs from them.
function renderFunctions() {
  if (!functions.length) return '      [_ in never]: never';
  return functions.map(([name, args, result]) => {
    const parsed = (args || '')
      .split(/,\s*(?![^(]*\))/)
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => {
        const m = a.match(/^(?:VARIADIC\s+|OUT\s+|INOUT\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)(?:\s+DEFAULT\s+.*)?$/i);
        if (!m) return null;
        const optional = /\sDEFAULT\s/i.test(a);
        return `          ${q(m[1])}${optional ? '?' : ''}: ${tsFromSqlName(m[2])}`;
      })
      .filter(Boolean);
    const argBlock = parsed.length ? `{\n${parsed.join('\n')}\n        }` : 'Record<PropertyKey, never>';
    return [
      `      ${q(name)}: {`,
      `        Args: ${argBlock}`,
      `        Returns: ${tsFromSqlName(result)}`,
      '      }',
    ].join('\n');
  }).join('\n');
}

function tsFromSqlName(sql) {
  const s = sql.replace(/^SETOF\s+/i, '').trim();
  const isSet = /^SETOF\s+/i.test(sql);
  let base;
  if (/^(boolean|bool)$/i.test(s)) base = 'boolean';
  else if (/^(numeric|integer|int|bigint|smallint|real|double precision)/i.test(s)) base = 'number';
  else if (/^jsonb?$/i.test(s)) base = 'Json';
  else if (/^void$/i.test(s)) base = 'undefined';
  else base = 'string';
  return isSet ? `${base}[]` : base;
}

const output = `// Generated by scripts/gen-db-types.mjs — do not edit by hand.
//
// Regenerate after changing the schema:
//   node scripts/gen-db-types.mjs "postgresql://…" src/types/database.ts
//
// Use with @supabase/supabase-js:
//   createClient<Database>(SUPABASE_URL, SUPABASE_KEY)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${renderRelations(false)}
    };
    Views: {
${renderRelations(true) || '      [_ in never]: never'}
    };
    Functions: {
${renderFunctions()}
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])> =
  (PublicSchema['Tables'] & PublicSchema['Views'])[T] extends { Row: infer R } ? R : never;

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Update: infer U } ? U : never;

// ---- Onboarding vocabularies ------------------------------------------------
// These live as text + CHECK constraints rather than Postgres enums, matching
// how every other status column in this database is modelled, so they are
// restated here as string unions for the editor's benefit.

export type SectionTier = 'core' | 'scope' | 'advisory' | 'vertical';

export type FieldKind = 'scalar' | 'repeating_group';

export type FieldType =
  | 'short_text' | 'long_text' | 'number' | 'currency' | 'date' | 'email'
  | 'phone' | 'url' | 'boolean' | 'select' | 'multi_select' | 'file_upload'
  | 'checklist_item';

/** \`unknown\` and \`not_applicable\` are deliberate answers, not blanks. */
export type ResponseStatus = 'answered' | 'unknown' | 'not_applicable';

export type EngagementStatus =
  | 'draft' | 'invited' | 'in_progress' | 'submitted' | 'complete' | 'archived';

export type EngagementSectionStatus =
  | 'not_started' | 'in_progress' | 'submitted' | 'accepted' | 'waived';

/** How TaylorMade holds access. Never a credential — see onboarding_access_grants. */
export type AccessMethod = 'delegated' | 'shared' | 'owner_holds' | 'unknown' | 'missing';

export type AccessStatus =
  | 'pending' | 'requested' | 'granted' | 'verified' | 'blocked' | 'not_applicable';

export type ContactRole = 'owner' | 'operations' | 'finance' | 'marketing' | 'contact';

export type FieldOption = { value: string; label: string };
`;

writeFileSync(OUT, output);
console.log(`wrote ${OUT} (${relations.size} relations, ${functions.length} functions)`);
