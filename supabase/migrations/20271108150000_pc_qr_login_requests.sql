-- PC QR 로그인 요청 (휴대폰 디바이 앱으로 PC 로그인 승인)
-- 설계: docs/audit/windows-qr-login-design-2026-11-08.md · Owner 「그래 만들어」 2026-11-08 · 인증 잠금 재개방 트리거 2
-- 운영 적용은 Owner 별도 승인 후 (AGENTS.md 개발 프로세스 2번).

create table if not exists public.pc_login_requests (
  id uuid primary key default gen_random_uuid(),
  -- PC 만 아는 비밀값(httpOnly 쿠키)의 sha256 — QR 을 그 PC 에 묶는다
  pc_secret_hash text not null,
  -- QR 안 1회용 값의 sha256 — 평문은 QR 에만
  qr_nonce_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'consumed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_by_user_id uuid references auth.users (id) on delete cascade,
  approved_at timestamptz,
  consumed_at timestamptz,
  pc_ip text,
  pc_user_agent text,
  pc_client text,
  pc_geo_country text,
  pc_geo_city text,
  approver_ip text
);

create index if not exists pc_login_requests_expires_at_idx on public.pc_login_requests (expires_at);
create index if not exists pc_login_requests_approved_by_idx on public.pc_login_requests (approved_by_user_id)
  where approved_by_user_id is not null;

-- 서버(service_role) 전용 — user_sessions 와 같은 방식
alter table public.pc_login_requests enable row level security;
alter table public.pc_login_requests force row level security;
revoke all on table public.pc_login_requests from anon, authenticated;
grant all on table public.pc_login_requests to service_role;

comment on table public.pc_login_requests is
  'PC QR 로그인 — PC 가 만든 요청을 휴대폰(로그인 회원)이 승인하면 PC 에 그 회원 세션을 1회 발급. 2분 만료·1회용·PC 쿠키 결합.';
