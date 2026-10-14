-- TEST-only durable ledger for deploy promotion evidence.
-- Apply ONLY to Supabase project tcwnueuzuxftyomttdyu.
-- Do NOT apply to production (ckdosyydvgzqwpbwuhon).

create table if not exists public.dibay_deploy_promotion_ledger (
  sha text primary key,
  status text not null,
  layers jsonb not null default '["web"]'::jsonb,
  impact_scope text not null default 'web_admin_deploy',
  pipeline jsonb not null default '{}'::jsonb,
  gates jsonb not null default '[]'::jsonb,
  verified_by uuid null,
  verified_at timestamptz null,
  cancelled_by text null,
  cancelled_at timestamptz null,
  promoted_by uuid null,
  promoted_at timestamptz null,
  error text null,
  github_result text null,
  promote_locked boolean not null default false,
  promote_lock_reason text null,
  updated_at timestamptz not null default now()
);

comment on table public.dibay_deploy_promotion_ledger is
  'DIBAY TEST deploy promotion ledger — evidence + verify/promote audit (TEST only)';

alter table public.dibay_deploy_promotion_ledger enable row level security;

-- service_role bypasses RLS; no anon/authenticated policies (admin API uses service path).
