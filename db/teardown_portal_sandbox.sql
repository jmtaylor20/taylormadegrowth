-- Removes everything db/seed_portal_sandbox.sql created.
--
-- Run this before onboarding a real client, so nobody ever sees a fake company
-- in the CRM next to a real one.
--
-- Deleting the clients cascades to contacts, engagements, sections, responses,
-- response rows, access grants and asset metadata.
--
-- Uploaded FILES are the exception, twice over. Storage objects live in another
-- schema so they do not cascade, and Supabase refuses to let SQL delete them at
-- all — storage.protect_delete() raises 42501, deliberately, so nobody orphans a
-- bucket by hand. So this file cannot remove them: it lists them instead, and
-- they come out through the Storage API (the dashboard's Storage → onboarding
-- browser, or the portal's own Remove button while the rows still exist).
--
-- Take the files out BEFORE running this. Once the asset rows are gone there is
-- nothing left naming the objects, and they become genuinely orphaned.

-- Run this first. Anything it lists must be removed through Storage.
select coalesce(string_agg(a.storage_path, E'\n'), '(none — nothing to remove)') as files_to_delete_first
  from public.onboarding_assets a
  join public.onboarding_engagements e on e.id = a.engagement_id
 where e.notes like '%[sandbox]%';

begin;

delete from public.clients where notes like '%[sandbox]%';

-- The auth users the sandbox aliases created when they signed in. Leaving them
-- would be harmless — with no contact row, onboarding_client_ids() returns
-- nothing and the portal signs them straight back out — but a live auth list
-- should only hold people who are real.
delete from auth.users where email like 'josh+sandbox%';

commit;

-- Should be zero on every row.
select
  (select count(*) from public.clients where notes like '%[sandbox]%')              as clients,
  (select count(*) from public.onboarding_engagements where notes like '%[sandbox]%') as engagements,
  (select count(*) from public.client_contacts where email like 'josh+sandbox%')    as contacts,
  (select count(*) from auth.users where email like 'josh+sandbox%')                as auth_users;
