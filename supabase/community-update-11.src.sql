-- Garage 197 update 11: likes, comments, mentions, richer notifications, photo feed, profiles,
-- people you may know, car of the week, photos in messages, group chats.
-- Safe to run more than once.

-- ---------- profiles ----------
alter table public.garages add column if not exists bio text check (char_length(bio) <= 160);
alter table public.garages add column if not exists cover text check (char_length(cover) <= 300);
create or replace function public.is_avatar(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from garages g where (g.avatar = p_name or g.cover = p_name) and g.user_id::text = split_part(p_name, '/', 1));
$$;

-- ---------- helpers that take the user explicitly ----------
create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a));
$$;
create or replace function public.user_can_see(p_user uuid, p_kind text, p_ref text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
if p_user is null or p_ref is null then return false; end if;
if p_kind = 'post' then
return exists (select 1 from community_posts p join community_members m on m.community_id = p.community_id and m.user_id = p_user
where p.id = p_ref::uuid and not blocked_between(p_user, p.user_id));
elsif p_kind = 'pupdate' then
return exists (select 1 from project_updates u join projects p on p.id = u.project_id
where u.id = p_ref::uuid and (p.user_id = p_user or (p.shared and are_friends(p_user, p.user_id) and not blocked_between(p_user, p.user_id))));
elsif p_kind = 'event' then
return exists (select 1 from events e where e.id = p_ref::uuid and not blocked_between(p_user, e.creator)
and (e.creator = p_user
or (e.community_id is not null and exists (select 1 from community_members m where m.community_id = e.community_id and m.user_id = p_user))
or (e.community_id is null and are_friends(p_user, e.creator))));
elsif p_kind = 'car' then
o := split_part(p_ref, '/', 1)::uuid;
return exists (select 1 from cars c left join garages g on g.user_id = c.user_id
where c.user_id = o and c.id = substr(p_ref, 38)
and (o = p_user or (coalesce(g.shared, false) and are_friends(p_user, o) and not blocked_between(p_user, o))));
end if;
return false;
exception when others then return false;
end $$;
drop function if exists public.target_info(text, text);
create function public.target_info(p_kind text, p_ref text) returns table (owner uuid, title text, link text)
language plpgsql stable security definer set search_path = public as $$
begin
if p_kind = 'post' then
return query select p.user_id, c.name, 'community/' || c.id::text from community_posts p join communities c on c.id = p.community_id where p.id = p_ref::uuid;
elsif p_kind = 'pupdate' then
return query select p.user_id, p.title, 'project/' || p.id::text from project_updates u join projects p on p.id = u.project_id where u.id = p_ref::uuid;
elsif p_kind = 'event' then
return query select e.creator, e.title, 'events'::text from events e where e.id = p_ref::uuid;
elsif p_kind = 'car' then
return query select c.user_id, coalesce(c.data->>'name', ''), 'car/' || c.id from cars c where c.user_id = split_part(p_ref, '/', 1)::uuid and c.id = substr(p_ref, 38);
end if;
exception when others then return;
end $$;

-- ---------- likes, comments, mentions ----------
create table if not exists public.reactions (
kind text not null check (kind in ('post', 'pupdate', 'event', 'car')),
ref text not null check (char_length(ref) <= 120),
user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
created_at timestamptz not null default now(),
primary key (kind, ref, user_id)
);
create table if not exists public.comments (
id uuid primary key default gen_random_uuid(),
kind text not null check (kind in ('post', 'pupdate', 'event', 'car')),
ref text not null check (char_length(ref) <= 120),
user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
body text not null check (char_length(body) between 1 and 1000),
created_at timestamptz not null default now()
);
create index if not exists comments_target on public.comments (kind, ref, created_at);
create table if not exists public.mentions (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references auth.users (id) on delete cascade,
by_user uuid not null references auth.users (id) on delete cascade,
kind text not null,
ref text not null,
comment_id uuid references public.comments (id) on delete cascade,
created_at timestamptz not null default now()
);
create index if not exists mentions_user on public.mentions (user_id, created_at desc);
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.mentions enable row level security;
create or replace function public.set_like(p_kind text, p_ref text, p_on boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
if me is null then raise exception 'Sign in first'; end if;
if not user_can_see(me, p_kind, p_ref) then raise exception 'Not available'; end if;
if coalesce(p_on, true) then
insert into reactions (kind, ref, user_id) values (p_kind, p_ref, me) on conflict do nothing;
else
delete from reactions r where r.kind = p_kind and r.ref = p_ref and r.user_id = me;
end if;
return (select count(*) from reactions r where r.kind = p_kind and r.ref = p_ref);
end $$;
create or replace function public.add_mentions(p_by uuid, p_kind text, p_ref text, p_comment uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare m text; u uuid;
begin
for m in select distinct (regexp_matches(lower(coalesce(p_body, '')), '@([a-z0-9_]{3,20})', 'g'))[1] loop
u := (select g.user_id from garages g where g.username = m);
if u is not null and u <> p_by and user_can_see(u, p_kind, p_ref) then
insert into mentions (user_id, by_user, kind, ref, comment_id) values (u, p_by, p_kind, p_ref, p_comment);
end if;
end loop;
end $$;
create or replace function public.add_comment(p_kind text, p_ref text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := trim(coalesce(p_body, '')); cid uuid;
begin
if me is null then raise exception 'Sign in first'; end if;
if b = '' then raise exception 'Empty'; end if;
if not user_can_see(me, p_kind, p_ref) then raise exception 'Not available'; end if;
if (select count(*) from comments c where c.user_id = me and c.created_at > now() - interval '1 minute') >= 20 then raise exception 'Too fast'; end if;
insert into comments (kind, ref, user_id, body) values (p_kind, p_ref, me, left(b, 1000)) returning id into cid;
perform add_mentions(me, p_kind, p_ref, cid, b);
return cid;
end $$;
create or replace function public.delete_comment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c comments;
begin
select * into c from comments where id = p_id;
if not found then return; end if;
if c.user_id = auth.uid() or (select t.owner from target_info(c.kind, c.ref) t limit 1) = auth.uid() then
delete from comments where id = p_id;
end if;
end $$;
drop function if exists public.list_comments(text, text);
create function public.list_comments(p_kind text, p_ref text)
returns table (id uuid, author_id uuid, author text, username text, avatar text, mine boolean, can_remove boolean, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
select c.id, c.user_id, display_name(c.user_id), username_of(c.user_id), avatar_of(c.user_id), c.user_id = auth.uid(),
c.user_id = auth.uid() or (select t.owner from target_info(p_kind, p_ref) t limit 1) = auth.uid(), c.body, c.created_at
from comments c
where c.kind = p_kind and c.ref = p_ref and user_can_see(auth.uid(), p_kind, p_ref) and not blocked_with(c.user_id)
order by c.created_at limit 300;
$$;
drop function if exists public.list_likers(text, text);
create function public.list_likers(p_kind text, p_ref text)
returns table (user_id uuid, name text, username text, avatar text, me boolean)
language sql stable security definer set search_path = public as $$
select r.user_id, display_name(r.user_id), username_of(r.user_id), avatar_of(r.user_id), r.user_id = auth.uid()
from reactions r
where r.kind = p_kind and r.ref = p_ref and user_can_see(auth.uid(), p_kind, p_ref) and not blocked_with(r.user_id)
order by r.created_at desc limit 300;
$$;
drop function if exists public.engagement(text, text[]);
create function public.engagement(p_kind text, p_refs text[])
returns table (ref text, likes bigint, me_liked boolean, comments bigint)
language sql stable security definer set search_path = public as $$
select x.ref,
(select count(*) from reactions r where r.kind = p_kind and r.ref = x.ref),
exists (select 1 from reactions r where r.kind = p_kind and r.ref = x.ref and r.user_id = auth.uid()),
(select count(*) from comments c where c.kind = p_kind and c.ref = x.ref)
from unnest(p_refs[1:200]) x (ref)
where user_can_see(auth.uid(), p_kind, x.ref);
$$;
create or replace function public.post_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
perform add_mentions(new.user_id, 'post', new.id::text, null, new.body);
return new;
end $$;
drop trigger if exists post_mentions on public.community_posts;
create trigger post_mentions after insert on public.community_posts for each row execute function public.post_mentions();
create or replace function public.engage_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
delete from reactions where kind = tg_argv[0] and ref = old.id::text;
delete from comments where kind = tg_argv[0] and ref = old.id::text;
delete from mentions where kind = tg_argv[0] and ref = old.id::text;
return old;
end $$;
drop trigger if exists engage_cleanup on public.community_posts;
create trigger engage_cleanup after delete on public.community_posts for each row execute function public.engage_cleanup('post');
drop trigger if exists engage_cleanup on public.project_updates;
create trigger engage_cleanup after delete on public.project_updates for each row execute function public.engage_cleanup('pupdate');
drop trigger if exists engage_cleanup on public.events;
create trigger engage_cleanup after delete on public.events for each row execute function public.engage_cleanup('event');
create or replace function public.user_by_username(p_username text) returns uuid
language sql stable security definer set search_path = public as $$
select g.user_id from garages g where auth.uid() is not null and g.username = lower(trim(leading '@' from trim(coalesce(p_username, '')))) and not blocked_with(g.user_id);
$$;

-- ---------- photo-first home feed ----------
drop function if exists public.home_feed();
create function public.home_feed()
returns table (kind text, ref text, at timestamptz, who uuid, who_name text, username text, avatar text, title text, link text, body text, photo text, likes bigint, me_liked boolean, comments bigint, mine boolean)
language sql stable security definer set search_path = public as $$
select x.kind, x.ref, x.at, x.who, display_name(x.who), username_of(x.who), avatar_of(x.who), x.title, x.link, x.body, x.photo,
(select count(*) from reactions r where r.kind = x.kind and r.ref = x.ref),
exists (select 1 from reactions r where r.kind = x.kind and r.ref = x.ref and r.user_id = auth.uid()),
(select count(*) from comments c where c.kind = x.kind and c.ref = x.ref),
x.who = auth.uid()
from (
select 'post'::text, p.id::text, p.created_at, p.user_id, c.name, 'community/' || c.id::text, p.body, p.photo
from community_posts p join communities c on c.id = p.community_id
where is_member(p.community_id) and not blocked_with(p.user_id)
union all
select 'pupdate', u.id::text, u.created_at, p.user_id, p.title, 'project/' || p.id::text, u.body, u.photo
from project_updates u join projects p on p.id = u.project_id
where can_see_project(p.id)
union all
select 'car', c.user_id::text || '/' || c.id, c.created_at, c.user_id, coalesce(c.data->>'name', ''), 'friend/' || c.user_id::text || '/' || c.id,
nullif(concat_ws(' ', c.data->>'year', c.data->>'model'), ''), c.data#>>'{photo,path}'
from cars c join garages g on g.user_id = c.user_id and g.shared
where c.user_id <> auth.uid() and are_friends(auth.uid(), c.user_id) and not blocked_with(c.user_id)
union all
select 'project', p.id::text, p.created_at, p.user_id, p.title, 'project/' || p.id::text, p.kind, null
from projects p
where p.user_id <> auth.uid() and can_see_project(p.id)
union all
select 'joined', m.community_id::text || '/' || m.user_id::text, m.joined_at, m.user_id, c.name, 'community/' || c.id::text, null, null
from community_members m join communities c on c.id = m.community_id
where m.user_id <> auth.uid() and are_friends(auth.uid(), m.user_id) and not blocked_with(m.user_id)
) x (kind, ref, at, who, title, link, body, photo)
where auth.uid() is not null and x.at > now() - interval '90 days'
order by x.at desc limit 60;
$$;

-- ---------- member pages, faces, people you may know ----------
drop function if exists public.member_profile(uuid);
create function public.member_profile(p_user uuid)
returns table (user_id uuid, name text, avatar text, garage text, city text, links jsonb, relation text, friendship uuid, shared boolean, communities jsonb, username text,
bio text, cover text, n_cars bigint, n_friends bigint, n_communities bigint)
language sql stable security definer set search_path = public as $$
select p_user, display_name(p_user), avatar_of(p_user), nullif(trim(g.name), ''),
case when f.status = 'accepted' or p_user = auth.uid() then g.city end,
case when f.status = 'accepted' or p_user = auth.uid() then coalesce(g.links, '{}'::jsonb) else '{}'::jsonb end,
case when p_user = auth.uid() then 'self' when f.id is null then 'none' when f.status = 'accepted' then 'friends'
when f.addressee = auth.uid() then 'incoming' else 'sent' end,
f.id, coalesce(g.shared, false) and f.status = 'accepted',
coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
from communities c join community_members a on a.community_id = c.id and a.user_id = auth.uid()
join community_members b on b.community_id = c.id and b.user_id = p_user), '[]'::jsonb),
g.username, g.bio, g.cover,
case when p_user = auth.uid() or (coalesce(g.shared, false) and f.status = 'accepted') then (select count(*) from cars c where c.user_id = p_user) end,
(select count(*) from friendships x where x.status = 'accepted' and p_user in (x.requester, x.addressee)),
(select count(*) from community_members m where m.user_id = p_user)
from auth.users u
left join garages g on g.user_id = u.id
left join friendships f on (f.requester = auth.uid() and f.addressee = p_user) or (f.requester = p_user and f.addressee = auth.uid())
where u.id = p_user and auth.uid() is not null and not blocked_with(p_user)
limit 1;
$$;
drop function if exists public.list_communities();
create function public.list_communities()
returns table (id uuid, name text, about text, members bigint, joined boolean, mine boolean, host text, faces jsonb)
language sql stable security definer set search_path = public as $$
select c.id, c.name, c.about, (select count(*) from community_members m where m.community_id = c.id),
is_member(c.id), c.owner = auth.uid(), display_name(c.owner),
case when is_member(c.id) then coalesce((select jsonb_agg(jsonb_build_object('id', y.user_id, 'name', display_name(y.user_id), 'avatar', avatar_of(y.user_id)))
from (select m.user_id from community_members m where m.community_id = c.id and not blocked_with(m.user_id) order by m.joined_at desc limit 6) y), '[]'::jsonb) else '[]'::jsonb end
from communities c where auth.uid() is not null
order by is_member(c.id) desc, 4 desc, c.created_at desc limit 200;
$$;
drop function if exists public.list_events();
create function public.list_events()
returns table (id uuid, title text, starts_at timestamptz, place text, details text, community_id uuid, community text, host text, host_id uuid, going bigint, me_going boolean, mine boolean, faces jsonb)
language sql stable security definer set search_path = public as $$
select e.id, e.title, e.starts_at, e.place, e.details, e.community_id, c.name, display_name(e.creator), e.creator,
(select count(*) from event_rsvps r where r.event_id = e.id),
exists (select 1 from event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()), e.creator = auth.uid(),
coalesce((select jsonb_agg(jsonb_build_object('id', y.user_id, 'name', display_name(y.user_id), 'avatar', avatar_of(y.user_id)))
from (select r.user_id from event_rsvps r where r.event_id = e.id and not blocked_with(r.user_id) order by r.created_at limit 6) y), '[]'::jsonb)
from events e left join communities c on c.id = e.community_id
where e.starts_at > now() - interval '12 hours' and can_see_event(e.id) and not blocked_with(e.creator)
order by e.starts_at limit 100;
$$;
drop function if exists public.suggest_people();
create function public.suggest_people()
returns table (user_id uuid, name text, username text, avatar text, why text, via text, score bigint)
language sql stable security definer set search_path = public as $$
with fr as (
select case when f.requester = auth.uid() then f.addressee else f.requester end as other
from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
), cand as (
select b.user_id as u, 2 as s, 'community'::text as k, c.name as w
from community_members a join community_members b on b.community_id = a.community_id and b.user_id <> a.user_id
join communities c on c.id = a.community_id
where a.user_id = auth.uid()
union all
select case when f.requester = fr.other then f.addressee else f.requester end, 3, 'mutual', display_name(fr.other)
from fr join friendships f on f.status = 'accepted' and fr.other in (f.requester, f.addressee)
)
select x.u, display_name(x.u), username_of(x.u), avatar_of(x.u), (array_agg(x.k order by x.s desc))[1], (array_agg(x.w order by x.s desc))[1], sum(x.s)
from cand x
where auth.uid() is not null and x.u <> auth.uid() and not blocked_with(x.u)
and not exists (select 1 from friendships f where (f.requester = auth.uid() and f.addressee = x.u) or (f.requester = x.u and f.addressee = auth.uid()))
group by x.u order by 7 desc, 2 limit 12;
$$;

-- ---------- car of the week ----------
create table if not exists public.cotw_entries (
id uuid primary key default gen_random_uuid(),
community_id uuid not null references public.communities (id) on delete cascade,
user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
week date not null,
car_name text not null check (char_length(car_name) between 1 and 120),
photo text check (char_length(photo) <= 300),
caption text check (char_length(caption) <= 300),
created_at timestamptz not null default now(),
unique (community_id, user_id, week)
);
create table if not exists public.cotw_votes (
entry_id uuid not null references public.cotw_entries (id) on delete cascade,
user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
created_at timestamptz not null default now(),
primary key (entry_id, user_id)
);
alter table public.cotw_entries enable row level security;
alter table public.cotw_votes enable row level security;
create or replace function public.cotw_week() returns date
language sql stable as $$ select date_trunc('week', now() at time zone 'utc')::date; $$;
create or replace function public.cotw_winner(p_community uuid, p_week date) returns uuid
language sql stable security definer set search_path = public as $$
select e.id from cotw_entries e join cotw_votes v on v.entry_id = e.id
where e.community_id = p_community and e.week = p_week
group by e.id, e.created_at order by count(*) desc, e.created_at limit 1;
$$;
create or replace function public.cotw_enter(p_community uuid, p_car_name text, p_photo text, p_caption text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); eid uuid;
begin
if me is null then raise exception 'Sign in first'; end if;
if not is_member(p_community) then raise exception 'Join first'; end if;
if p_photo is not null and split_part(p_photo, '/', 1) <> me::text then raise exception 'Bad photo'; end if;
insert into cotw_entries (community_id, user_id, week, car_name, photo, caption)
values (p_community, me, cotw_week(), left(trim(p_car_name), 120), p_photo, nullif(left(trim(coalesce(p_caption, '')), 300), ''))
on conflict (community_id, user_id, week) do update set car_name = excluded.car_name, photo = excluded.photo, caption = excluded.caption
returning id into eid;
return eid;
end $$;
create or replace function public.cotw_vote(p_entry uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e cotw_entries;
begin
if me is null then raise exception 'Sign in first'; end if;
select * into e from cotw_entries where id = p_entry;
if not found or e.week <> cotw_week() or not is_member(e.community_id) then return 'closed'; end if;
if e.user_id = me then return 'own'; end if;
if exists (select 1 from cotw_votes v where v.entry_id = p_entry and v.user_id = me) then
delete from cotw_votes v where v.entry_id = p_entry and v.user_id = me;
return 'removed';
end if;
delete from cotw_votes v using cotw_entries x where v.entry_id = x.id and v.user_id = me and x.community_id = e.community_id and x.week = e.week;
insert into cotw_votes (entry_id, user_id) values (p_entry, me);
return 'voted';
end $$;
create or replace function public.cotw_withdraw(p_entry uuid) returns void
language sql security definer set search_path = public as $$
delete from cotw_entries e where e.id = p_entry and (e.user_id = auth.uid() or owns_community(e.community_id));
$$;
create or replace function public.cotw_json(p_entry uuid) returns jsonb
language sql stable security definer set search_path = public as $$
select jsonb_build_object('id', e.id, 'user_id', e.user_id, 'name', display_name(e.user_id), 'avatar', avatar_of(e.user_id),
'car_name', e.car_name, 'photo', e.photo, 'caption', e.caption, 'mine', e.user_id = auth.uid(),
'votes', (select count(*) from cotw_votes v where v.entry_id = e.id),
'me_voted', exists (select 1 from cotw_votes v where v.entry_id = e.id and v.user_id = auth.uid()))
from cotw_entries e where e.id = p_entry;
$$;
create or replace function public.cotw(p_community uuid) returns jsonb
language sql stable security definer set search_path = public as $$
select case when not is_member(p_community) then null else jsonb_build_object(
'week', cotw_week(), 'ends', cotw_week() + 7,
'winner', cotw_json(cotw_winner(p_community, cotw_week() - 7)),
'entries', coalesce((select jsonb_agg(cotw_json(e.id) order by (select count(*) from cotw_votes v where v.entry_id = e.id) desc, e.created_at)
from cotw_entries e where e.community_id = p_community and e.week = cotw_week() and not blocked_with(e.user_id)), '[]'::jsonb)) end;
$$;
create or replace function public.cotw_photo_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from cotw_entries e where e.photo = p_name and is_member(e.community_id));
$$;
drop policy if exists "car of the week photos" on storage.objects;
create policy "car of the week photos" on storage.objects for select to authenticated
using (bucket_id = 'car-files' and public.cotw_photo_visible(name));

-- ---------- photos and shared cars in private messages ----------
alter table public.messages add column if not exists photo text check (char_length(photo) <= 300);
alter table public.messages add column if not exists attach jsonb check (pg_column_size(attach) < 1000);
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (char_length(body) <= 2000 and (char_length(body) >= 1 or photo is not null or attach is not null));
drop function if exists public.send_message(uuid, text);
drop function if exists public.send_message(uuid, text, text, jsonb);
create function public.send_message(p_to uuid, p_body text, p_photo text default null, p_attach jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := trim(coalesce(p_body, ''));
begin
if me is null then raise exception 'Sign in first'; end if;
if p_to is null or p_to = me or (b = '' and p_photo is null and p_attach is null) then return 'empty'; end if;
if blocked_with(p_to) or not are_friends(me, p_to) then return 'not_friends'; end if;
if p_photo is not null and split_part(p_photo, '/', 1) <> me::text then return 'empty'; end if;
if (select count(*) from messages where sender = me and created_at > now() - interval '1 minute') >= 30 then return 'slow'; end if;
insert into messages (sender, recipient, body, photo, attach) values (me, p_to, left(b, 2000), p_photo, p_attach);
return 'sent';
end $$;
drop function if exists public.chat_with(uuid);
create function public.chat_with(p_user uuid)
returns table (id uuid, mine boolean, body text, created_at timestamptz, read boolean, photo text, attach jsonb)
language plpgsql security definer set search_path = public as $$
begin
if auth.uid() is null or blocked_with(p_user) then return; end if;
update messages m set read_at = now() where m.sender = p_user and m.recipient = auth.uid() and m.read_at is null;
return query select y.id, y.mine, y.body, y.created_at, y.read, y.photo, y.attach from (
select m.id, m.sender = auth.uid() as mine, m.body, m.created_at, m.read_at is not null as read, m.photo, m.attach from messages m
where (m.sender = auth.uid() and m.recipient = p_user) or (m.sender = p_user and m.recipient = auth.uid())
order by m.created_at desc limit 300) y order by y.created_at;
end $$;
create or replace function public.my_chats()
returns table (other uuid, name text, username text, avatar text, last_body text, last_at timestamptz, last_mine boolean, unread bigint, can_write boolean)
language sql stable security definer set search_path = public as $$
select x.other, display_name(x.other), username_of(x.other), avatar_of(x.other),
case when l.body <> '' then l.body when l.photo is not null then '[photo]' else '[shared]' end, l.created_at, l.sender = auth.uid(),
(select count(*) from messages m where m.sender = x.other and m.recipient = auth.uid() and m.read_at is null),
are_friends(auth.uid(), x.other)
from (select distinct case when m.sender = auth.uid() then m.recipient else m.sender end as other
from messages m where auth.uid() in (m.sender, m.recipient)) x
join lateral (select m.body, m.photo, m.created_at, m.sender from messages m
where (m.sender = auth.uid() and m.recipient = x.other) or (m.sender = x.other and m.recipient = auth.uid())
order by m.created_at desc limit 1) l on true
where not blocked_with(x.other)
order by l.created_at desc limit 200;
$$;
create or replace function public.message_photo_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from messages m where m.photo = p_name and auth.uid() in (m.sender, m.recipient));
$$;
drop policy if exists "message photos" on storage.objects;
create policy "message photos" on storage.objects for select to authenticated
using (bucket_id = 'car-files' and public.message_photo_visible(name));

-- ---------- group chats for communities and events ----------
create table if not exists public.group_messages (
id uuid primary key default gen_random_uuid(),
scope text not null check (scope in ('community', 'event')),
ref uuid not null,
user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
body text not null default '' check (char_length(body) <= 2000),
photo text check (char_length(photo) <= 300),
created_at timestamptz not null default now(),
check (char_length(body) >= 1 or photo is not null)
);
create index if not exists group_messages_recent on public.group_messages (scope, ref, created_at desc);
create table if not exists public.group_reads (
scope text not null,
ref uuid not null,
user_id uuid not null references auth.users (id) on delete cascade,
read_at timestamptz not null default now(),
primary key (scope, ref, user_id)
);
alter table public.group_messages enable row level security;
alter table public.group_reads enable row level security;
create or replace function public.can_group(p_scope text, p_ref uuid) returns boolean
language sql stable security definer set search_path = public as $$
select case when p_scope = 'community' then is_member(p_ref) when p_scope = 'event' then can_see_event(p_ref) else false end;
$$;
create or replace function public.send_group(p_scope text, p_ref uuid, p_body text, p_photo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := trim(coalesce(p_body, ''));
begin
if me is null then raise exception 'Sign in first'; end if;
if not can_group(p_scope, p_ref) then return 'closed'; end if;
if b = '' and p_photo is null then return 'empty'; end if;
if p_photo is not null and split_part(p_photo, '/', 1) <> me::text then return 'empty'; end if;
if (select count(*) from group_messages where user_id = me and created_at > now() - interval '1 minute') >= 30 then return 'slow'; end if;
insert into group_messages (scope, ref, user_id, body, photo) values (p_scope, p_ref, me, left(b, 2000), p_photo);
insert into group_reads (scope, ref, user_id, read_at) values (p_scope, p_ref, me, now())
on conflict (scope, ref, user_id) do update set read_at = now();
return 'sent';
end $$;
drop function if exists public.group_chat(text, uuid);
create function public.group_chat(p_scope text, p_ref uuid)
returns table (id uuid, author_id uuid, author text, avatar text, mine boolean, body text, photo text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
if auth.uid() is null or not can_group(p_scope, p_ref) then return; end if;
insert into group_reads (scope, ref, user_id, read_at) values (p_scope, p_ref, auth.uid(), now())
on conflict (scope, ref, user_id) do update set read_at = now();
return query select y.id, y.user_id, display_name(y.user_id), avatar_of(y.user_id), y.user_id = auth.uid(), y.body, y.photo, y.created_at from (
select m.id, m.user_id, m.body, m.photo, m.created_at from group_messages m
where m.scope = p_scope and m.ref = p_ref and not blocked_with(m.user_id)
order by m.created_at desc limit 300) y order by y.created_at;
end $$;
create or replace function public.delete_group_message(p_id uuid) returns void
language sql security definer set search_path = public as $$
delete from group_messages m where m.id = p_id and (m.user_id = auth.uid() or (m.scope = 'community' and owns_community(m.ref)));
$$;
drop function if exists public.my_group_chats();
create function public.my_group_chats()
returns table (scope text, ref uuid, title text, sub text, last_body text, last_author text, last_at timestamptz, unread bigint)
language sql stable security definer set search_path = public as $$
select g.scope, g.ref, g.title, g.sub,
case when l.body <> '' then l.body when l.photo is not null then '[photo]' end, display_name(l.user_id), l.created_at,
(select count(*) from group_messages m where m.scope = g.scope and m.ref = g.ref and m.user_id <> auth.uid() and not blocked_with(m.user_id)
and m.created_at > coalesce((select r.read_at from group_reads r where r.scope = g.scope and r.ref = g.ref and r.user_id = auth.uid()), 'epoch'::timestamptz))
from (
select 'community'::text as scope, c.id as ref, c.name as title, null::text as sub
from communities c join community_members m on m.community_id = c.id and m.user_id = auth.uid()
union all
select 'event', e.id, e.title, to_char(e.starts_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
from events e
where e.starts_at > now() - interval '7 days' and can_see_event(e.id) and not blocked_with(e.creator)
and (e.creator = auth.uid() or exists (select 1 from event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()))
) g
left join lateral (select m.body, m.photo, m.user_id, m.created_at from group_messages m
where m.scope = g.scope and m.ref = g.ref and not blocked_with(m.user_id) order by m.created_at desc limit 1) l on true
where auth.uid() is not null
order by l.created_at desc nulls last, g.title limit 100;
$$;
create or replace function public.group_photo_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from group_messages m where m.photo = p_name and can_group(m.scope, m.ref));
$$;
drop policy if exists "group chat photos" on storage.objects;
create policy "group chat photos" on storage.objects for select to authenticated
using (bucket_id = 'car-files' and public.group_photo_visible(name));
create or replace function public.group_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
delete from group_messages where scope = tg_argv[0] and ref = old.id;
delete from group_reads where scope = tg_argv[0] and ref = old.id;
return old;
end $$;
drop trigger if exists group_cleanup on public.communities;
create trigger group_cleanup after delete on public.communities for each row execute function public.group_cleanup('community');
drop trigger if exists group_cleanup on public.events;
create trigger group_cleanup after delete on public.events for each row execute function public.group_cleanup('event');

-- ---------- notifications, now with the person's photo ----------
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('post', 'event', 'community', 'user', 'contact', 'message', 'comment', 'gmessage'));
drop function if exists public.my_notifications();
create function public.my_notifications()
returns table (kind text, at timestamptz, who text, what text, ref text, who_id uuid, avatar text)
language sql stable security definer set search_path = public as $$
select n.kind, n.at, display_name(n.who_id), n.what, n.ref, n.who_id, avatar_of(n.who_id) from (
select 'request'::text, f.created_at, f.requester, null::text, f.id::text
from friendships f where f.addressee = auth.uid() and f.status = 'pending'
union all
select 'accepted', f.accepted_at, f.addressee, null, f.addressee::text
from friendships f where f.requester = auth.uid() and f.status = 'accepted' and f.accepted_at is not null
union all
select 'car', c.created_at, c.user_id, c.data->>'name', c.user_id::text || '/' || c.id
from cars c join garages g on g.user_id = c.user_id and g.shared
where c.user_id <> auth.uid() and are_friends(auth.uid(), c.user_id)
union all
select 'post', p.created_at, p.user_id, m.name, m.id::text
from community_posts p join communities m on m.id = p.community_id
where p.user_id <> auth.uid() and is_member(p.community_id)
union all
select 'event', e.created_at, e.creator, e.title, e.id::text
from events e where e.creator <> auth.uid() and e.starts_at > now() and can_see_event(e.id)
union all
select 'going', r.created_at, r.user_id, e.title, e.id::text
from event_rsvps r join events e on e.id = r.event_id where e.creator = auth.uid() and r.user_id <> auth.uid()
union all
select 'friendgoing', r.created_at, r.user_id, e.title, e.id::text
from event_rsvps r join events e on e.id = r.event_id
where e.creator <> auth.uid() and r.user_id <> auth.uid() and e.starts_at > now() and are_friends(auth.uid(), r.user_id) and can_see_event(e.id)
union all
select 'project', p.created_at, p.user_id, p.title, p.id::text
from projects p where p.user_id <> auth.uid() and can_see_project(p.id)
union all
select 'pupdate', u.created_at, p.user_id, p.title, p.id::text
from project_updates u join projects p on p.id = u.project_id where p.user_id <> auth.uid() and can_see_project(p.id)
union all
select 'suggest', s.created_at, s.user_id, p.title, p.id::text
from project_suggestions s join projects p on p.id = s.project_id where p.user_id = auth.uid() and s.user_id <> auth.uid()
union all
select 'helpful', s.created_at, p.user_id, p.title, p.id::text
from project_suggestions s join projects p on p.id = s.project_id where s.user_id = auth.uid() and p.user_id <> auth.uid() and (s.helpful or s.reply is not null) and can_see_project(p.id)
union all
select 'cheer', c.created_at, c.user_id, p.title, p.id::text
from project_cheers c join projects p on p.id = c.project_id where p.user_id = auth.uid() and c.user_id <> auth.uid()
union all
select 'like', r.created_at, r.user_id, t.title, r.kind || ':' || t.link
from reactions r cross join lateral target_info(r.kind, r.ref) t
where r.user_id <> auth.uid() and r.created_at > now() - interval '30 days' and t.owner = auth.uid()
union all
select 'comment', c.created_at, c.user_id, t.title, c.kind || ':' || t.link
from comments c cross join lateral target_info(c.kind, c.ref) t
where c.user_id <> auth.uid() and c.created_at > now() - interval '30 days' and t.owner = auth.uid()
union all
select 'mention', m.created_at, m.by_user, t.title, m.kind || ':' || case when m.kind = 'car' and t.owner <> auth.uid() then 'friend/' || m.ref else t.link end
from mentions m cross join lateral target_info(m.kind, m.ref) t
where m.user_id = auth.uid() and m.created_at > now() - interval '30 days' and user_can_see(auth.uid(), m.kind, m.ref)
union all
select 'cotw', (e.week + 7)::timestamptz, e.user_id, c.name, c.id::text
from cotw_entries e join communities c on c.id = e.community_id
where e.user_id = auth.uid() and e.week = cotw_week() - 7 and e.id = cotw_winner(e.community_id, e.week)
) n (kind, at, who_id, what, ref)
where auth.uid() is not null and n.at > now() - interval '30 days' and (n.who_id = auth.uid() or not blocked_with(n.who_id))
order by n.at desc limit 80;
$$;

-- ---------- permissions ----------
revoke all on function public.blocked_between(uuid, uuid), public.user_can_see(uuid, text, text), public.target_info(text, text), public.add_mentions(uuid, text, text, uuid, text), public.cotw_winner(uuid, date), public.cotw_json(uuid) from public, anon, authenticated;
revoke all on function public.set_like(text, text, boolean), public.add_comment(text, text, text), public.delete_comment(uuid), public.list_comments(text, text), public.list_likers(text, text), public.engagement(text, text[]), public.user_by_username(text), public.home_feed(), public.member_profile(uuid), public.list_communities(), public.list_events(), public.suggest_people(), public.cotw_enter(uuid, text, text, text), public.cotw_vote(uuid), public.cotw_withdraw(uuid), public.cotw(uuid), public.cotw_photo_visible(text), public.send_message(uuid, text, text, jsonb), public.chat_with(uuid), public.my_chats(), public.message_photo_visible(text), public.can_group(text, uuid), public.send_group(text, uuid, text, text), public.group_chat(text, uuid), public.delete_group_message(uuid), public.my_group_chats(), public.group_photo_visible(text), public.my_notifications(), public.is_avatar(text) from public, anon;
grant execute on function public.set_like(text, text, boolean), public.add_comment(text, text, text), public.delete_comment(uuid), public.list_comments(text, text), public.list_likers(text, text), public.engagement(text, text[]), public.user_by_username(text), public.home_feed(), public.member_profile(uuid), public.list_communities(), public.list_events(), public.suggest_people(), public.cotw_enter(uuid, text, text, text), public.cotw_vote(uuid), public.cotw_withdraw(uuid), public.cotw(uuid), public.cotw_photo_visible(text), public.send_message(uuid, text, text, jsonb), public.chat_with(uuid), public.my_chats(), public.message_photo_visible(text), public.can_group(text, uuid), public.send_group(text, uuid, text, text), public.group_chat(text, uuid), public.delete_group_message(uuid), public.my_group_chats(), public.group_photo_visible(text), public.my_notifications(), public.is_avatar(text) to authenticated;
notify pgrst, 'reload schema';
