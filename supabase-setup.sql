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

-- ===== Friends and shared garages. Safe to run more than once. =====

alter table public.garages add column if not exists shared boolean not null default false;
alter table public.garages add column if not exists links jsonb not null default '{}'::jsonb;
alter table public.cars add column if not exists created_at timestamptz not null default now();

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;

-- Either side can see or end a friendship. Requests and acceptances only go through the functions below.
drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists "end own friendships" on public.friendships;
create policy "end own friendships" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.status = 'accepted'
    and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
$$;

-- Send a request by email. Returns sent, accepted, exists, self or none.
create or replace function public.request_friend(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; f friendships;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into other from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if other is null then return 'none'; end if;
  if other = me then return 'self'; end if;
  select * into f from friendships where (requester = me and addressee = other) or (requester = other and addressee = me) limit 1;
  if found then
    if f.status = 'pending' and f.addressee = me then
      update friendships set status = 'accepted' where id = f.id; return 'accepted';
    end if;
    return 'exists';
  end if;
  insert into friendships (requester, addressee) values (me, other);
  return 'sent';
end $$;

create or replace function public.accept_friend(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update friendships set status = 'accepted' where id = p_id and addressee = auth.uid() and status = 'pending';
$$;

drop function if exists public.my_friends();
create or replace function public.my_friends()
returns table (id uuid, other uuid, email text, garage text, shared boolean, status text, incoming boolean, links jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, o.id, o.email::text, g.name, coalesce(g.shared, false) and f.status = 'accepted', f.status, f.addressee = auth.uid(),
    case when f.status = 'accepted' then coalesce(g.links, '{}'::jsonb) else '{}'::jsonb end
  from friendships f
  join auth.users o on o.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  left join garages g on g.user_id = o.id
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

drop function if exists public.friends_cars(uuid);
-- Cars of friends who share their garage. Only the showroom details leave the owner's account:
-- never the price paid, VIN, registration, logbook, reminders or documents.
create or replace function public.friends_cars(p_owner uuid default null)
returns table (owner uuid, garage text, email text, car_id text, car jsonb, added timestamptz)
language sql stable security definer set search_path = public as $$
  select c.user_id, g.name, u.email::text, c.id,
    jsonb_strip_nulls(jsonb_build_object('name', c.data->'name', 'year', c.data->'year', 'model', c.data->'model',
      'colour', c.data->'colour', 'interior', c.data->'interior', 'miles', c.data->'miles', 'unit', c.data->'unit',
      'photo', c.data->'photo', 'gallery', c.data->'gallery')),
    c.created_at
  from cars c
  join garages g on g.user_id = c.user_id and g.shared
  join auth.users u on u.id = c.user_id
  where c.user_id <> auth.uid() and are_friends(auth.uid(), c.user_id)
    and (p_owner is null or c.user_id = p_owner)
  order by c.created_at desc
  limit case when p_owner is null then 12 else 200 end;
$$;

revoke all on function public.are_friends(uuid, uuid), public.request_friend(text), public.accept_friend(uuid), public.my_friends(), public.friends_cars(uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid), public.request_friend(text), public.accept_friend(uuid), public.my_friends(), public.friends_cars(uuid) to authenticated;

-- Friends can open a shared garage's car photos, and nothing else in the owner's folder.
create or replace function public.friend_can_view(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cars c join garages g on g.user_id = c.user_id and g.shared
    where c.user_id::text = split_part(p_name, '/', 1) and are_friends(auth.uid(), c.user_id)
      and (c.data->'photo'->>'path' = p_name or c.data->'gallery' @> jsonb_build_array(jsonb_build_object('path', p_name))));
$$;
revoke all on function public.friend_can_view(text) from public, anon;
grant execute on function public.friend_can_view(text) to authenticated;

drop policy if exists "friends car photos" on storage.objects;
create policy "friends car photos" on storage.objects for select to authenticated
  using (bucket_id = 'car-files' and public.friend_can_view(name));


-- ===== Communities and events. Safe to run more than once. =====

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  about text check (char_length(about) <= 500),
  created_at timestamptz not null default now()
);
create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists community_posts_recent on public.community_posts (community_id, created_at desc);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null default auth.uid() references auth.users (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  starts_at timestamptz not null,
  place text check (char_length(place) <= 120),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);
create table if not exists public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

create or replace function public.is_member(p_community uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members m where m.community_id = p_community and m.user_id = auth.uid());
$$;
create or replace function public.owns_community(p_community uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from communities c where c.id = p_community and c.owner = auth.uid());
$$;
-- An event with a community is for its members. An event without one is for the host's friends.
create or replace function public.can_see_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = p_event and (e.creator = auth.uid()
    or (e.community_id is not null and is_member(e.community_id))
    or (e.community_id is null and are_friends(auth.uid(), e.creator))));
$$;
-- The name other members see: the garage name, never the email address.
create or replace function public.display_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select g.name from garages g where g.user_id = p_user)), ''), 'A member');
$$;

-- Any signed-in user can find and join a community. Posts are for members only.
drop policy if exists "see communities" on public.communities;
create policy "see communities" on public.communities for select to authenticated using (true);
drop policy if exists "remove own community" on public.communities;
create policy "remove own community" on public.communities for delete to authenticated using (owner = auth.uid());

drop policy if exists "see own memberships" on public.community_members;
create policy "see own memberships" on public.community_members for select to authenticated using (user_id = auth.uid());
drop policy if exists "join" on public.community_members;
create policy "join" on public.community_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "leave" on public.community_members;
create policy "leave" on public.community_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members read posts" on public.community_posts;
create policy "members read posts" on public.community_posts for select to authenticated using (public.is_member(community_id));
drop policy if exists "members post" on public.community_posts;
create policy "members post" on public.community_posts for insert to authenticated with check (user_id = auth.uid() and public.is_member(community_id));
drop policy if exists "remove posts" on public.community_posts;
create policy "remove posts" on public.community_posts for delete to authenticated using (user_id = auth.uid() or public.owns_community(community_id));

drop policy if exists "see events" on public.events;
create policy "see events" on public.events for select to authenticated using (public.can_see_event(id));
drop policy if exists "create events" on public.events;
create policy "create events" on public.events for insert to authenticated with check (creator = auth.uid() and (community_id is null or public.is_member(community_id)));
drop policy if exists "remove own events" on public.events;
create policy "remove own events" on public.events for delete to authenticated using (creator = auth.uid());

drop policy if exists "see own rsvps" on public.event_rsvps;
create policy "see own rsvps" on public.event_rsvps for select to authenticated using (user_id = auth.uid());
drop policy if exists "rsvp" on public.event_rsvps;
create policy "rsvp" on public.event_rsvps for insert to authenticated with check (user_id = auth.uid() and public.can_see_event(event_id));
drop policy if exists "undo rsvp" on public.event_rsvps;
create policy "undo rsvp" on public.event_rsvps for delete to authenticated using (user_id = auth.uid());

create or replace function public.create_community(p_name text, p_about text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into communities (owner, name, about) values (auth.uid(), trim(p_name), nullif(trim(p_about), '')) returning id into cid;
  insert into community_members (community_id, user_id) values (cid, auth.uid());
  return cid;
end $$;

drop function if exists public.list_communities();
create function public.list_communities()
returns table (id uuid, name text, about text, members bigint, joined boolean, mine boolean, host text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.about, (select count(*) from community_members m where m.community_id = c.id),
    is_member(c.id), c.owner = auth.uid(), display_name(c.owner)
  from communities c where auth.uid() is not null
  order by is_member(c.id) desc, 4 desc, c.created_at desc limit 200;
$$;

drop function if exists public.list_posts(uuid);
create function public.list_posts(p_community uuid)
returns table (id uuid, author text, mine boolean, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, display_name(p.user_id), p.user_id = auth.uid(), p.body, p.created_at
  from community_posts p where p.community_id = p_community and is_member(p_community)
  order by p.created_at desc limit 100;
$$;

drop function if exists public.list_events();
create function public.list_events()
returns table (id uuid, title text, starts_at timestamptz, place text, details text, community_id uuid, community text, host text, going bigint, me_going boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.place, e.details, e.community_id, c.name, display_name(e.creator),
    (select count(*) from event_rsvps r where r.event_id = e.id),
    exists (select 1 from event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()), e.creator = auth.uid()
  from events e left join communities c on c.id = e.community_id
  where e.starts_at > now() - interval '12 hours' and can_see_event(e.id)
  order by e.starts_at limit 100;
$$;

revoke all on function public.is_member(uuid), public.owns_community(uuid), public.can_see_event(uuid), public.display_name(uuid), public.create_community(text, text), public.list_communities(), public.list_posts(uuid), public.list_events() from public, anon;
grant execute on function public.is_member(uuid), public.owns_community(uuid), public.can_see_event(uuid), public.display_name(uuid), public.create_community(text, text), public.list_communities(), public.list_posts(uuid), public.list_events() to authenticated;

notify pgrst, 'reload schema';

-- ===== Notifications, photo posts, blocking and reports. Safe to run more than once. =====

alter table public.friendships add column if not exists accepted_at timestamptz;
alter table public.garages add column if not exists seen_at timestamptz;
alter table public.community_posts add column if not exists photo text check (char_length(photo) <= 300);
alter table public.community_posts drop constraint if exists community_posts_body_check;
alter table public.community_posts add constraint community_posts_body_check check (char_length(body) <= 2000 and (char_length(body) >= 1 or photo is not null));

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "see own blocks" on public.blocks;
create policy "see own blocks" on public.blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists "unblock" on public.blocks;
create policy "unblock" on public.blocks for delete to authenticated using (blocker = auth.uid());

-- Reports go to the app owner, who reads them in the Supabase table editor. Users cannot read them back.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('post', 'event', 'community', 'user')),
  ref text not null check (char_length(ref) <= 80),
  reason text check (char_length(reason) <= 500),
  snapshot text check (char_length(snapshot) <= 2500),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "send reports" on public.reports;
create policy "send reports" on public.reports for insert to authenticated with check (reporter = auth.uid());

-- True when either person has blocked the other.
create or replace function public.blocked_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = p_user) or (b.blocker = p_user and b.blocked = auth.uid()));
$$;

create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user is null or p_user = auth.uid() then return; end if;
  insert into blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
  delete from friendships where (requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid());
end $$;

drop function if exists public.my_blocks();
create function public.my_blocks() returns table (blocked uuid, name text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked, display_name(b.blocked), b.created_at from blocks b where b.blocker = auth.uid() order by b.created_at desc;
$$;

create or replace function public.request_friend(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; f friendships;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into other from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if other is null then return 'none'; end if;
  if other = me then return 'self'; end if;
  if exists (select 1 from blocks where blocker = me and blocked = other) then return 'blocked'; end if;
  if exists (select 1 from blocks where blocker = other and blocked = me) then return 'none'; end if;
  select * into f from friendships where (requester = me and addressee = other) or (requester = other and addressee = me) limit 1;
  if found then
    if f.status = 'pending' and f.addressee = me then
      update friendships set status = 'accepted', accepted_at = now() where id = f.id; return 'accepted';
    end if;
    return 'exists';
  end if;
  insert into friendships (requester, addressee) values (me, other);
  return 'sent';
end $$;

create or replace function public.accept_friend(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update friendships set status = 'accepted', accepted_at = now() where id = p_id and addressee = auth.uid() and status = 'pending';
$$;

drop function if exists public.list_posts(uuid);
create function public.list_posts(p_community uuid)
returns table (id uuid, author text, author_id uuid, mine boolean, body text, photo text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, display_name(p.user_id), p.user_id, p.user_id = auth.uid(), p.body, p.photo, p.created_at
  from community_posts p where p.community_id = p_community and is_member(p_community) and not blocked_with(p.user_id)
  order by p.created_at desc limit 100;
$$;

drop function if exists public.list_events();
create function public.list_events()
returns table (id uuid, title text, starts_at timestamptz, place text, details text, community_id uuid, community text, host text, host_id uuid, going bigint, me_going boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.place, e.details, e.community_id, c.name, display_name(e.creator), e.creator,
    (select count(*) from event_rsvps r where r.event_id = e.id),
    exists (select 1 from event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()), e.creator = auth.uid()
  from events e left join communities c on c.id = e.community_id
  where e.starts_at > now() - interval '12 hours' and can_see_event(e.id) and not blocked_with(e.creator)
  order by e.starts_at limit 100;
$$;

-- Members can open photos attached to posts in their communities.
create or replace function public.member_can_view(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_posts p where p.photo = p_name and is_member(p.community_id));
$$;
drop policy if exists "community post photos" on storage.objects;
create policy "community post photos" on storage.objects for select to authenticated
  using (bucket_id = 'car-files' and public.member_can_view(name));

-- What happened lately that this user should know about.
drop function if exists public.my_notifications();
create function public.my_notifications()
returns table (kind text, at timestamptz, who text, what text, ref text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'request'::text, f.created_at, u.email::text, null::text, f.id::text
      from friendships f join auth.users u on u.id = f.requester where f.addressee = auth.uid() and f.status = 'pending'
    union all
    select 'accepted', f.accepted_at, u.email::text, null, f.addressee::text
      from friendships f join auth.users u on u.id = f.addressee where f.requester = auth.uid() and f.status = 'accepted' and f.accepted_at is not null
    union all
    select 'car', c.created_at, coalesce(nullif(trim(g.name), ''), u.email::text), c.data->>'name', c.user_id::text || '/' || c.id
      from cars c join garages g on g.user_id = c.user_id and g.shared join auth.users u on u.id = c.user_id
      where c.user_id <> auth.uid() and are_friends(auth.uid(), c.user_id)
    union all
    select 'post', p.created_at, display_name(p.user_id), m.name, m.id::text
      from community_posts p join communities m on m.id = p.community_id
      where p.user_id <> auth.uid() and is_member(p.community_id) and not blocked_with(p.user_id)
    union all
    select 'event', e.created_at, display_name(e.creator), e.title, e.id::text
      from events e where e.creator <> auth.uid() and e.starts_at > now() and can_see_event(e.id) and not blocked_with(e.creator)
    union all
    select 'going', r.created_at, display_name(r.user_id), e.title, e.id::text
      from event_rsvps r join events e on e.id = r.event_id where e.creator = auth.uid() and r.user_id <> auth.uid() and not blocked_with(r.user_id)
  ) n (kind, at, who, what, ref)
  where n.at > now() - interval '30 days'
  order by n.at desc limit 60;
$$;

revoke all on function public.blocked_with(uuid), public.block_user(uuid), public.my_blocks(), public.member_can_view(text), public.my_notifications(), public.list_posts(uuid), public.list_events(), public.request_friend(text), public.accept_friend(uuid) from public, anon;
grant execute on function public.blocked_with(uuid), public.block_user(uuid), public.my_blocks(), public.member_can_view(text), public.my_notifications(), public.list_posts(uuid), public.list_events(), public.request_friend(text), public.accept_friend(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ===== Profiles and contact messages. Safe to run more than once. =====

alter table public.garages add column if not exists display_name text check (char_length(display_name) <= 40);
alter table public.garages add column if not exists city text check (char_length(city) <= 60);
alter table public.garages add column if not exists avatar text check (char_length(avatar) <= 300);

alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('post', 'event', 'community', 'user', 'contact'));

-- The name other people see: the profile name, then the garage name, never the email address.
create or replace function public.display_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim((select g.display_name from garages g where g.user_id = p_user)), ''),
    nullif(trim((select g.name from garages g where g.user_id = p_user)), ''),
    'A member');
$$;
create or replace function public.avatar_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select g.avatar from garages g where g.user_id = p_user;
$$;

-- Profile photos can be opened by any signed-in user, because they appear beside posts.
create or replace function public.is_avatar(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garages g where g.avatar = p_name and g.user_id::text = split_part(p_name, '/', 1));
$$;
drop policy if exists "profile photos" on storage.objects;
create policy "profile photos" on storage.objects for select to authenticated
  using (bucket_id = 'car-files' and public.is_avatar(name));

drop function if exists public.my_friends();
create function public.my_friends()
returns table (id uuid, other uuid, email text, garage text, shared boolean, status text, incoming boolean, links jsonb, name text, city text, avatar text)
language sql stable security definer set search_path = public as $$
  select f.id, o.id, o.email::text, g.name, coalesce(g.shared, false) and f.status = 'accepted', f.status, f.addressee = auth.uid(),
    case when f.status = 'accepted' then coalesce(g.links, '{}'::jsonb) else '{}'::jsonb end,
    nullif(trim(g.display_name), ''), case when f.status = 'accepted' then g.city end, g.avatar
  from friendships f
  join auth.users o on o.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  left join garages g on g.user_id = o.id
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

drop function if exists public.list_posts(uuid);
create function public.list_posts(p_community uuid)
returns table (id uuid, author text, author_id uuid, mine boolean, body text, photo text, created_at timestamptz, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, display_name(p.user_id), p.user_id, p.user_id = auth.uid(), p.body, p.photo, p.created_at, avatar_of(p.user_id)
  from community_posts p where p.community_id = p_community and is_member(p_community) and not blocked_with(p.user_id)
  order by p.created_at desc limit 100;
$$;

revoke all on function public.avatar_of(uuid), public.is_avatar(text), public.my_friends(), public.list_posts(uuid), public.display_name(uuid) from public, anon;
grant execute on function public.avatar_of(uuid), public.is_avatar(text), public.my_friends(), public.list_posts(uuid), public.display_name(uuid) to authenticated;

notify pgrst, 'reload schema';
