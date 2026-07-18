-- Restrict listing of demo-assets bucket: drop the broad public SELECT policy on storage.objects.
-- Public URL reads (/storage/v1/object/public/demo-assets/...) still work because the bucket
-- is marked public — those requests bypass RLS. Removing the policy prevents anonymous
-- enumeration/listing of bucket contents via the storage API.
drop policy if exists "Leitura pública de demo-assets" on storage.objects;