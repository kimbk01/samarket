-- 필리핀형 수수료 정책 (v1)
-- - 업체/업종/기본 정책을 동일 테이블에서 관리
-- - 우선순위(priority: 낮을수록 우선) + 기간(starts_at/ends_at) + 활성(is_active)

create table if not exists public.store_fee_policies (
  id uuid primary key default gen_random_uuid(),
  policy_name text not null,
  store_id uuid null,
  category_id uuid null,
  fee_percent numeric(5, 2) not null default 0,
  fixed_fee integer not null default 0,
  delivery_fee_mode text not null default 'none',
  delivery_fee_percent numeric(5, 2) not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_fee_policies enable row level security;

create index if not exists idx_store_fee_policies_active_window_priority
  on public.store_fee_policies (is_active, starts_at, ends_at, priority);

create index if not exists idx_store_fee_policies_store_active
  on public.store_fee_policies (store_id, is_active);

create index if not exists idx_store_fee_policies_category_active
  on public.store_fee_policies (category_id, is_active);

comment on table public.store_fee_policies is '필리핀형 건별 수수료 정책(업체/업종/기본). priority 낮을수록 우선.';
comment on column public.store_fee_policies.fee_percent is '플랫폼 수수료(%) 예: 12.00';
comment on column public.store_fee_policies.fixed_fee is '고정 수수료(PHP 등 정수 금액)';
comment on column public.store_fee_policies.delivery_fee_mode is '배달비 수익 반영 모드: none|percent';
comment on column public.store_fee_policies.delivery_fee_percent is '배달비 중 플랫폼 수익 비율(%)';

-- updated_at trigger (shared helper `public.set_updated_at()` expected)
drop trigger if exists trg_store_fee_policies_updated_at on public.store_fee_policies;
create trigger trg_store_fee_policies_updated_at
before update on public.store_fee_policies
for each row execute function public.set_updated_at();

