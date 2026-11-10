-- 고객센터 접수형 3단계 (Owner 「3단계 진행」 2026-11-10) — 어드민 문의 유형 관리.
-- 분야·세부의 정의(코드·서버 판정)는 lib/support/support-category-registry.ts 그대로 두고,
-- 어드민이 바꾸는 값(이름 ko/en · 순서 · 앱 노출)만 이 표에 덮어쓴다.
-- 행이 없으면 코드 기본값 그대로. 「숨기기」= 고객 분야·세부 선택 목록에서만 빠짐(지난 문의·주문 화면 등 고정 진입은 그대로).
-- 읽기·쓰기는 서버(service role)만 — 앱은 /api/support/category-settings, 어드민은 /api/admin/support/category-settings.

create table if not exists public.support_category_settings (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('MEMBER', 'OWNER')),
  category_id text not null check (char_length(category_id) between 1 and 64),
  -- '' = 분야 자체, 그 외 = 그 분야의 세부 유형 id
  issue_id text not null default '' check (char_length(issue_id) <= 64),
  label_ko text check (label_ko is null or char_length(label_ko) between 1 and 40),
  label_en text check (label_en is null or char_length(label_en) between 1 and 60),
  sort_order integer check (sort_order is null or sort_order between 0 and 9999),
  hidden boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint support_category_settings_key unique (audience, category_id, issue_id)
);

comment on table public.support_category_settings is
  '고객센터 문의 유형 어드민 설정(이름·순서·노출) — 정의는 코드 레지스트리, 이 표는 덮어쓰기만';

alter table public.support_category_settings enable row level security;
-- 정책 없음 = anon/authenticated 직접 접근 불가(서버 service role 전용)
revoke all on table public.support_category_settings from anon, authenticated;
