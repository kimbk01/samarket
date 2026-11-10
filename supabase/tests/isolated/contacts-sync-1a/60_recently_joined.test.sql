-- 「최근 가입」 표시 기준 시험 (20271111150000 적용 후) — 실기 2026-11-11 결함 2
-- 오래된 회원이 오늘 처음 동의(번호 등록)해도 「최근 가입」이 아니어야 하고, 가입 7일 안 회원만 표시.
INSERT INTO public.profiles (id, nickname, phone, phone_country_code, phone_verified, phone_verified_at, created_at) VALUES
 ('00000000-0000-0000-0000-0000000000d1', 'V1', '09170000041', '+63', true, now(), now() - interval '200 days'),
 ('00000000-0000-0000-0000-0000000000d2', 'OLD', '09170000042', '+63', true, now(), now() - interval '200 days'),
 ('00000000-0000-0000-0000-0000000000d3', 'NEW', '09170000043', '+63', true, now(), now() - interval '2 days'),
 ('00000000-0000-0000-0000-0000000000d4', 'EDGE', '09170000044', '+63', true, now(), now() - interval '8 days');

DO $rj$
DECLARE
  V uuid := '00000000-0000-0000-0000-0000000000d1';
  O uuid := '00000000-0000-0000-0000-0000000000d2';
  N uuid := '00000000-0000-0000-0000-0000000000d3';
  E uuid := '00000000-0000-0000-0000-0000000000d4';
  rV bytea := t_h('inst-V1'); r jsonb; sV uuid;
BEGIN
  PERFORM public.cm_contacts_consent(V, 'v1', t_h('v-phone'), 1::smallint, now());
  -- 세 회원 모두 지금 처음 동의 → 번호 등록 시각(registered_at)은 모두 「방금」
  PERFORM public.cm_contacts_consent(O, 'v1', t_h('o-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(N, 'v1', t_h('n-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(E, 'v1', t_h('e-phone'), 1::smallint, now());
  sV := (public.cm_contacts_register_source(V, rV, 'android')->>'source_id')::uuid;
  PERFORM public.cm_contacts_apply(V, sV, rV, 'batch-rj-v1', 'snapshot_chunk', NULL,
    jsonb_build_array(jsonb_build_object('h', t_hex('o-phone'), 'r', 'ref-o'),
                      jsonb_build_object('h', t_hex('n-phone'), 'r', 'ref-n'),
                      jsonb_build_object('h', t_hex('e-phone'), 'r', 'ref-e')), NULL, NULL, 0, 1);
  r := public.cm_contacts_list(V, sV, NULL);
  PERFORM t_ok('RECENT-1 세 회원 모두 목록에 나옴', t_members(r) @> ARRAY[O, N, E], r::text);
  PERFORM t_ok('RECENT-2 200일 전 가입 · 오늘 처음 동의 → 최근 가입 아님', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = O AND NOT (m->>'recently_joined')::boolean), r::text);
  PERFORM t_ok('RECENT-3 2일 전 가입 → 최근 가입', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = N AND (m->>'recently_joined')::boolean), r::text);
  PERFORM t_ok('RECENT-4 8일 전 가입 → 최근 가입 아님 (가입 안내 #3 과 같은 7일)', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = E AND NOT (m->>'recently_joined')::boolean), r::text);
END
$rj$;
