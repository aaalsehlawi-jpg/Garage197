-- Garage 197: tables, privacy rules and file storage. Safe to run more than once.

create table if not exists public.garages (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.cars (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.garages enable row level security;
alter table public.cars enable row level security;

drop policy if exists "own garage" on public.garages;
create policy "own garage" on public.garages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own cars" on public.cars;
create policy "own cars" on public.cars for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private bucket for logbook photos and documents. Each user can only reach their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('car-files', 'car-files', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "own car files" on storage.objects;
create policy "own car files" on storage.objects for all to authenticated
  using (bucket_id = 'car-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'car-files' and (storage.foldername(name))[1] = auth.uid()::text);
