-- Storage for onboarding assets: logos, brand files, portfolio photos.
--
-- Private bucket. The tenant boundary in the bucket is the first path segment,
-- which is the engagement id:
--
--   <engagement_id>/<section_key>/<uuid>-<filename>
--
-- public.onboarding_assets enforces that prefix on the metadata side (see its
-- validate trigger), and the policies below enforce it on the object side, so
-- the two cannot drift apart.

insert into storage.buckets (id, name, public)
values ('onboarding', 'onboarding', false)
on conflict (id) do nothing;

-- The PIN-gated ops app reads and writes as anon, same as everywhere else.
drop policy if exists onboarding_objects_anon_all on storage.objects;
create policy onboarding_objects_anon_all on storage.objects
  for all to anon
  using (bucket_id = 'onboarding')
  with check (bucket_id = 'onboarding');

drop policy if exists onboarding_objects_staff_all on storage.objects;
create policy onboarding_objects_staff_all on storage.objects
  for all to authenticated
  using (bucket_id = 'onboarding' and (select public.is_staff()))
  with check (bucket_id = 'onboarding' and (select public.is_staff()));

-- A client contact reaches only objects under their own engagements' prefixes.
-- Compared as text rather than cast to uuid: a malformed first segment must
-- fail the comparison, not raise, and an error raised inside a policy is a
-- side channel that tells the caller their guess was well-formed.
drop policy if exists onboarding_objects_contact_all on storage.objects;
create policy onboarding_objects_contact_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'onboarding'
    and (storage.foldername(name))[1] in (
      select e::text from public.onboarding_engagement_ids() e
    )
  )
  with check (
    bucket_id = 'onboarding'
    and (storage.foldername(name))[1] in (
      select e::text from public.onboarding_engagement_ids() e
    )
  );
