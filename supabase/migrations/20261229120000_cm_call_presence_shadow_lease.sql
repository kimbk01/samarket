-- DIBAY CALL P0 — Presence SSOT Server/DB CUT 1
-- Shadow / future participant-liveness lease observation columns.
-- NOT client lease-capability proof. Production end authority remains legacy HB both-stale.
-- NON_NULL lease_until MUST NOT be treated as lease-capable.

alter table public.community_messenger_call_sessions
  add column if not exists caller_presence_lease_until timestamptz,
  add column if not exists callee_presence_lease_until timestamptz;

comment on column public.community_messenger_call_sessions.caller_presence_lease_until is
  'SHADOW presence lease observation for caller (provisional). NOT capability proof; NOT Production termination authority. HB columns remain WebView observability/compat.';

comment on column public.community_messenger_call_sessions.callee_presence_lease_until is
  'SHADOW presence lease observation for callee (provisional). NOT capability proof; NOT Production termination authority. HB columns remain WebView observability/compat.';
