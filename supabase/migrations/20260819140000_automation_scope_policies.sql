-- Let the automation identities actually reach what their scopes name.
--
-- 20260819130000 gave the Google scripts their own Supabase Auth identities, but
-- no policy consulted automation_has_scope(), so both scripts authenticated
-- successfully and then read and wrote nothing. That failure is quiet by
-- construction — an empty result set is indistinguishable from "no work to do",
-- which is exactly how the Ads sync reported success while writing zero rows.
--
-- These policies are deliberately per-command rather than FOR ALL. Neither
-- script deletes anything, so neither gets DELETE. The document pipeline reads
-- clients and writes status back to them, but it has no business creating or
-- removing one.

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- table,        scope,             commands the script actually performs
      ('ad_metrics',   'ad_metrics',      array['select','insert','update']),
      ('clients',      'crm_documents',   array['select','update']),
      ('invoices',     'crm_documents',   array['select','insert','update']),
      ('proposals',    'crm_documents',   array['select','update']),
      ('reports',      'crm_documents',   array['select','update'])
    ) as t(tbl, scope, cmds)
  loop
    if to_regclass('public.' || quote_ident(spec.tbl)) is null then
      continue;
    end if;

    -- SELECT and DELETE take USING only; INSERT takes WITH CHECK only; UPDATE
    -- takes both. Getting that wrong is how a policy ends up looking correct
    -- and permitting nothing.
    if 'select' = any (spec.cmds) then
      execute format('drop policy if exists %I on public.%I;', spec.tbl || '_automation_select', spec.tbl);
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select public.automation_has_scope(%L)));',
        spec.tbl || '_automation_select', spec.tbl, spec.scope);
    end if;

    if 'insert' = any (spec.cmds) then
      execute format('drop policy if exists %I on public.%I;', spec.tbl || '_automation_insert', spec.tbl);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ((select public.automation_has_scope(%L)));',
        spec.tbl || '_automation_insert', spec.tbl, spec.scope);
    end if;

    if 'update' = any (spec.cmds) then
      execute format('drop policy if exists %I on public.%I;', spec.tbl || '_automation_update', spec.tbl);
      execute format(
        'create policy %I on public.%I for update to authenticated using ((select public.automation_has_scope(%L))) with check ((select public.automation_has_scope(%L)));',
        spec.tbl || '_automation_update', spec.tbl, spec.scope, spec.scope);
    end if;
  end loop;
end $$;
