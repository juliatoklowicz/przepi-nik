-- Wklej całość w Supabase: SQL Editor → New query → Run.

create table if not exists public.recipes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  category text not null default 'obiad',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_user_updated on public.recipes (user_id, updated_at desc);

alter table public.recipes enable row level security;

drop policy if exists "Własne przepisy" on public.recipes;
create policy "Własne przepisy" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Zdjęcia przepisów
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

drop policy if exists "Wgrywanie własnych zdjęć" on storage.objects;
create policy "Wgrywanie własnych zdjęć" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Usuwanie własnych zdjęć" on storage.objects;
create policy "Usuwanie własnych zdjęć" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
