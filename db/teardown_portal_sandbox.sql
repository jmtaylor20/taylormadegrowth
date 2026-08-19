-- Removes everything db/seed_portal_sandbox.sql created.
--
-- Run this before onboarding a real client, so nobody ever sees a fake company
-- in the CRM next to a real one.
--
-- Deleting the clients cascades to contacts, engagements, sections, responses,
-- response rows, access grants and asset metadata. Storage objects do NOT
-- cascade — they live in another schema — so they are cleared first, while the
-- rows naming them still exist.

begin;

delete from storage.objects o
 using public.onboarding_assets a
  join public.onboarding_engagements e on e.id = a.engagement_id
 where o.bucket_id = 'onboarding'
   and o.name = a.storage_path
   and e.notes like '%[sandbox]%';

delete from public.clients where notes like '%[sandbox]%';

commit;

-- Should be zero on every row.
select
  (select count(*) from public.clients where notes like '%[sandbox]%')              as clients,
  (select count(*) from public.onboarding_engagements where notes like '%[sandbox]%') as engagements,
  (select count(*) from public.client_contacts where email like 'josh+sandbox%')    as contacts;
