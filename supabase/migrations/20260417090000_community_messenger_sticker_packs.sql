-- 커뮤니티 메신저 스티커 — message_type / last_message_type 에 sticker 추가
-- 카탈로그: sticker_packs, sticker_items (RLS: 로그인 사용자 읽기 전용)

alter table public.community_messenger_messages
  drop constraint if exists community_messenger_messages_message_type_check;

alter table public.community_messenger_messages
  add constraint community_messenger_messages_message_type_check
  check (message_type in ('text', 'image', 'file', 'system', 'call_stub', 'voice', 'sticker'));

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_last_message_type_check;

alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_last_message_type_check
  check (last_message_type in ('text', 'image', 'file', 'system', 'call_stub', 'voice', 'sticker'));

create table if not exists public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sticker_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.sticker_packs (id) on delete cascade,
  file_url text not null,
  keyword text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sticker_items_pack_sort_idx
  on public.sticker_items (pack_id, sort_order asc, id asc);

alter table public.sticker_packs enable row level security;
alter table public.sticker_items enable row level security;

drop policy if exists sticker_packs_authenticated_select on public.sticker_packs;
create policy sticker_packs_authenticated_select
  on public.sticker_packs
  for select
  to authenticated
  using (true);

drop policy if exists sticker_items_authenticated_select on public.sticker_items;
create policy sticker_items_authenticated_select
  on public.sticker_items
  for select
  to authenticated
  using (true);

-- 시드: Twemoji 기반 정적 경로 (빌드 스크립트로 WebP 생성 — MIT)
-- https://github.com/twitter/twemoji
insert into public.sticker_packs (slug, name, icon_url, sort_order)
values
  ('basic', '기본', '/stickers/packs/basic/1f600.webp', 0),
  ('reaction', '리액션', '/stickers/packs/reaction/1f44d.webp', 1)
on conflict (slug) do nothing;

insert into public.sticker_items (pack_id, file_url, keyword, sort_order)
select p.id, v.file_url, v.keyword, v.sort_order
from public.sticker_packs p
cross join (values
  ('basic', '/stickers/packs/basic/1f600.webp', 'happy', 0),
  ('basic', '/stickers/packs/basic/1f622.webp', 'sad', 1),
  ('basic', '/stickers/packs/basic/1f620.webp', 'angry', 2),
  ('basic', '/stickers/packs/basic/2764.webp', 'love', 3),
  ('basic', '/stickers/packs/basic/1f923.webp', 'laugh', 4),
  ('basic', '/stickers/packs/basic/1f632.webp', 'surprise', 5),
  ('reaction', '/stickers/packs/reaction/1f44d.webp', 'thumbs_up', 0),
  ('reaction', '/stickers/packs/reaction/1f44f.webp', 'clap', 1),
  ('reaction', '/stickers/packs/reaction/1f525.webp', 'fire', 2),
  ('reaction', '/stickers/packs/reaction/2b50.webp', 'star', 3),
  ('reaction', '/stickers/packs/reaction/1f389.webp', 'party', 4)
) as v(pack_slug, file_url, keyword, sort_order)
where p.slug = v.pack_slug
  and not exists (
    select 1
    from public.sticker_items i
    where i.pack_id = p.id and i.file_url = v.file_url
  );
