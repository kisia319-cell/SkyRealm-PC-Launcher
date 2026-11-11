-- Persistent custom player avatars in a public bucket with per-user write isolation.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('skyrealm-avatars','skyrealm-avatars',true,12582912,array['image/webp'])
on conflict (id) do update set public=true,file_size_limit=12582912,allowed_mime_types=array['image/webp'];

drop policy if exists "SkyRealm avatar owner insert" on storage.objects;
create policy "SkyRealm avatar owner insert" on storage.objects
for insert to authenticated
with check (bucket_id='skyrealm-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "SkyRealm avatar owner update" on storage.objects;
create policy "SkyRealm avatar owner update" on storage.objects
for update to authenticated
using (bucket_id='skyrealm-avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='skyrealm-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "SkyRealm avatar owner delete" on storage.objects;
create policy "SkyRealm avatar owner delete" on storage.objects
for delete to authenticated
using (bucket_id='skyrealm-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
