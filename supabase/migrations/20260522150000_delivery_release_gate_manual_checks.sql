-- Step 29: 배달 Release Gate — 수동 체크 저장 (운영 기록용)
-- - 자동 검사는 API에서 수행(무거운 SQL 금지), 수동 체크는 DB에 기록

create table if not exists public.delivery_release_gate_manual_checks (
  key text primary key,
  label text not null,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_by uuid references public.profiles(id) on delete set null,
  note text,
  updated_at timestamptz not null default now()
);

create index if not exists delivery_release_gate_manual_checks_checked_idx
  on public.delivery_release_gate_manual_checks (checked, updated_at desc);

drop trigger if exists trg_delivery_release_gate_manual_checks_updated_at
  on public.delivery_release_gate_manual_checks;
create trigger trg_delivery_release_gate_manual_checks_updated_at
before update on public.delivery_release_gate_manual_checks
for each row execute function public.set_updated_at();

alter table public.delivery_release_gate_manual_checks enable row level security;

drop policy if exists delivery_release_gate_manual_checks_admin_all
  on public.delivery_release_gate_manual_checks;
create policy delivery_release_gate_manual_checks_admin_all
  on public.delivery_release_gate_manual_checks
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- seed keys (idempotent)
insert into public.delivery_release_gate_manual_checks (key, label)
values
  ('ws_buyer_no_proof_media', '구매자 WS payload에서 POD 증빙 path/url 비노출 확인'),
  ('ws_owner_no_proof_media', '오너 WS payload에서 POD 증빙 path/url 비노출 확인'),
  ('e2e_buyer_owner_rider_admin', '주문자→오너→라이더→관리자 E2E 흐름 확인'),
  ('pod_signed_url_expiry', 'POD signedUrl 만료(5~10분) 확인'),
  ('settlement_paid_flow', '정산 paid 시나리오 확인'),
  ('refund_then_settlement_held', '환불 후 정산 held 확인')
on conflict (key) do nothing;

