-- 진입 감사 5단계 (2026-11-17 · Owner 「설계안대로 진행」) — 인트로 소재 묶음 · 노출 기록.
-- 근거: docs/audit/intro-popup-entry-audit-2026-11-17.md §3 IN-3 (게시 1개 · 진입마다 안 바뀜) · IN-8 (기록 없음) ·
--       IN-1·OS-5 (로딩 시간 안의 네이티브 인트로 = 그림 1장 + 배경색 + 고정 브랜드 줄).
-- 덧붙이기만 한다: 기존 인트로(게시본 · Live 1행)는 그대로. 묶음이 비어 있으면 지금과 같다.
-- 쓰기·읽기 = 서버(service_role)만 — RLS 켬, 정책 없음.

create table if not exists public.launch_intro_creatives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'paused',
  sort_order integer not null default 0,
  start_at timestamptz null,
  end_at timestamptz null,
  image_path text not null,
  image_sha256 text not null,
  image_mime text not null,
  image_bytes integer not null,
  image_width integer not null,
  image_height integer not null,
  background_color text not null default '#075740',
  duration_ms integer not null default 2000,
  cta_href text null,
  show_ad_label boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_intro_creatives_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint launch_intro_creatives_status_check check (status in ('active', 'paused', 'ended')),
  constraint launch_intro_creatives_window_check check (start_at is null or end_at is null or start_at < end_at),
  constraint launch_intro_creatives_sha_check check (image_sha256 ~ '^[0-9a-f]{64}$'),
  constraint launch_intro_creatives_mime_check check (image_mime in ('image/png', 'image/jpeg', 'image/webp')),
  constraint launch_intro_creatives_bytes_check check (image_bytes > 0 and image_bytes <= 5242880),
  constraint launch_intro_creatives_size_check check (greatest(image_width, image_height) >= 1080 and image_width <= 4096 and image_height <= 4096),
  constraint launch_intro_creatives_bg_check check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint launch_intro_creatives_duration_check check (duration_ms between 1000 and 5000),
  constraint launch_intro_creatives_cta_check check (cta_href is null or (char_length(cta_href) <= 500 and (cta_href like '/%' or cta_href like 'https://%')))
);

create index if not exists launch_intro_creatives_live_idx
  on public.launch_intro_creatives (status, sort_order);

alter table public.launch_intro_creatives enable row level security;

create table if not exists public.launch_intro_events (
  id bigint generated always as identity primary key,
  creative_id uuid null references public.launch_intro_creatives (id) on delete set null,
  event_type text not null,
  renderer text not null,
  platform text null,
  exposure_id text not null,
  device_key text null,
  user_id uuid null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint launch_intro_events_type_check check (event_type in ('impression', 'skip', 'click', 'complete')),
  constraint launch_intro_events_renderer_check check (renderer in ('native', 'web')),
  constraint launch_intro_events_exposure_check check (char_length(exposure_id) between 8 and 64)
);

-- 같은 노출의 같은 종류는 한 번만(팝업 D-13 과 같은 장치)
create unique index if not exists launch_intro_events_exposure_uidx
  on public.launch_intro_events (exposure_id, event_type);
create index if not exists launch_intro_events_creative_idx
  on public.launch_intro_events (creative_id, event_type, created_at desc);

alter table public.launch_intro_events enable row level security;

comment on table public.launch_intro_creatives is
  '인트로 소재 묶음(진입 감사 IN-3): 진입마다 다음 소재. 그림 1장 + 배경색 + 표시 시간(1~5초) + 목적지. 네이티브 인트로가 그린다.';
comment on table public.launch_intro_events is
  '인트로 노출·건너뛰기·누름·완료 기록(진입 감사 IN-8).';
