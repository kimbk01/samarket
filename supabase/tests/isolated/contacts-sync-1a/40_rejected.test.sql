-- §5-5 「요청 → 거절 → 빠짐」 시험 (20271111130000 적용 후 · 30_audit_f1 다음)
INSERT INTO public.profiles (id, nickname, phone, phone_country_code, phone_verified, phone_verified_at, created_at) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'R1', '09170000021', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000a2', 'R2', '09170000022', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000a3', 'R3', '09170000023', '+63', true, now(), now() - interval '100 days');

DO $rj$
DECLARE
  V uuid := '00000000-0000-0000-0000-0000000000a1';
  P uuid := '00000000-0000-0000-0000-0000000000a2';
  Q uuid := '00000000-0000-0000-0000-0000000000a3';
  rV bytea := t_h('inst-V1');
  r jsonb; sV uuid; tok text;
BEGIN
  PERFORM public.cm_contacts_consent(V, 'v1', t_h('v-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(P, 'v1', t_h('p-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(Q, 'v1', t_h('q-phone'), 1::smallint, now());
  sV := (public.cm_contacts_register_source(V, rV, 'android')->>'source_id')::uuid;
  PERFORM public.cm_contacts_apply(V, sV, rV, 'batch-rj-snap', 'snapshot_chunk', NULL,
    jsonb_build_array(jsonb_build_object('h', t_hex('p-phone'), 'r', 'ref-p'),
                      jsonb_build_object('h', t_hex('q-phone'), 'r', 'ref-q')), NULL, NULL, 0, 1);
  r := public.cm_contacts_list(V, sV, NULL);
  PERFORM t_ok('RJ-1 P·Q 표시', t_members(r) = ARRAY[P, Q], r::text);

  -- V 가 P 에게 요청 → P 가 거절
  INSERT INTO community_friend_requests (requester_id, addressee_id, status, responded_at) VALUES (V, P, 'rejected', now());
  -- Q 가 V 에게 요청 → V 가 거절
  INSERT INTO community_friend_requests (requester_id, addressee_id, status, responded_at) VALUES (Q, V, 'rejected', now());
  r := public.cm_contacts_list(V, sV, NULL);
  PERFORM t_ok('RJ-2 거절당한 P·내가 거절한 Q 모두 빠짐', t_members(r) = '{}'::uuid[], r::text);
  PERFORM t_ok('RJ-3 known_refs 에 ref-p·ref-q (초대에도 안 나옴)',
    r->'known_refs' @> '["ref-p","ref-q"]'::jsonb AND jsonb_array_length(r->'known_refs') = 2, r::text);
  tok := r->>'token';

  -- 거절한 쪽이 해제 → cancelled → 다시 나타남 + 토큰 바뀜
  UPDATE community_friend_requests SET status = 'cancelled', responded_at = now() + interval '1 second'
  WHERE requester_id = V AND addressee_id = P;
  r := public.cm_contacts_list(V, sV, tok);
  PERFORM t_ok('RJ-4 해제 → not_modified 아님 · P 다시 나타남 · Q 계속 빠짐',
    r->>'not_modified' IS NULL AND t_members(r) = ARRAY[P], r::text);

  -- 대기 중 요청은 빠지지 않음 (요청됨/수락 버튼)
  INSERT INTO community_friend_requests (requester_id, addressee_id, status) VALUES (P, V, 'pending')
  ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'pending';
  r := public.cm_contacts_list(V, sV, NULL);
  PERFORM t_ok('RJ-5 대기 요청은 received 로 표시', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = P AND m->>'request_state' = 'received'), r::text);
END
$rj$;
