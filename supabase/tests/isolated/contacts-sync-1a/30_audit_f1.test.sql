-- 연락처 동기화 감사 수정 F1 시험 (20271111120000_messenger_contacts_sync_audit_f1.sql 적용 후 · 10_contacts.test.sql 다음)
-- A2 하루 한도 초과 연락처가 며칠에 걸쳐 확정 · A3 재시작 시 지운 번호 삭제 · §5-1 정지 계정 제외 · A7 known_refs · P2 토큰 · 버려진 스냅숏 3일
INSERT INTO public.profiles (id, nickname, phone, phone_country_code, phone_verified, phone_verified_at, created_at) VALUES
 ('00000000-0000-0000-0000-0000000000f1', 'F', '09170000011', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000f2', 'G', '09170000012', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000f3', 'H', '09170000013', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000f4', 'K', '09170000014', '+63', true, now(), now() - interval '100 days');

DO $f1$
DECLARE
  F uuid := '00000000-0000-0000-0000-0000000000f1';
  G uuid := '00000000-0000-0000-0000-0000000000f2';
  H uuid := '00000000-0000-0000-0000-0000000000f3';
  K uuid := '00000000-0000-0000-0000-0000000000f4';
  rF bytea := t_h('inst-F1');
  r jsonb; sF uuid; gen int; tok text; tok2 text; rev bigint;
  c0 jsonb; c1 jsonb;
BEGIN
  PERFORM public.cm_contacts_consent(F, 'v1', t_h('f-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(G, 'v1', t_h('g-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(H, 'v1', t_h('h-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(K, 'v1', t_h('k-phone'), 1::smallint, now());
  sF := (public.cm_contacts_register_source(F, rF, 'android')->>'source_id')::uuid;

  -- ── A2: 하루 한도 100 · 연락처 150개 (75 × 2 조각)
  rev := (SELECT revision FROM messenger_contacts_admin_settings WHERE id = 1);
  PERFORM public.save_messenger_contacts_admin_settings_cas(rev, NULL, NULL, NULL, 100, 1000, NULL, NULL, NULL, NULL);
  c0 := (SELECT jsonb_agg(jsonb_build_object('h', t_hex('p' || n), 'r', 'r' || n)) FROM generate_series(1, 74) n)
        || jsonb_build_array(jsonb_build_object('h', t_hex('y-gone'), 'r', 'ref-y'));
  c1 := (SELECT jsonb_agg(jsonb_build_object('h', t_hex('q' || n), 'r', 's' || n)) FROM generate_series(1, 75) n);
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a2-0', 'snapshot_chunk', NULL, c0, NULL, NULL, 0, 2);
  gen := (r->>'generation')::int;
  PERFORM t_ok('F1-A2-1 첫 조각 75 통과', r->>'ok' = 'true' AND r->>'committed' = 'false', r::text);
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a2-1', 'snapshot_chunk', NULL, c1, NULL, gen, 1, 2);
  PERFORM t_ok('F1-A2-2 둘째 조각 → 오늘 한도 초과', r->>'error' = 'daily_limit', r::text);
  -- 같은 날 다시 시작: 첫 조각은 이미 올린 번호 → 새 번호 0 (한도 소비 없음) · 단 y-gone 은 폰에서 지움
  c0 := (SELECT jsonb_agg(jsonb_build_object('h', t_hex('p' || n), 'r', 'r' || n)) FROM generate_series(1, 74) n);
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a2-0b', 'snapshot_chunk', NULL, c0, NULL, NULL, 0, 2);
  PERFORM t_ok('F1-A2-3 재시작 첫 조각 통과·새 번호 다시 안 셈',
    r->>'ok' = 'true' AND (SELECT new_numbers_count FROM messenger_contact_settings WHERE user_id = F) = 75, r::text);
  -- 다음 날
  UPDATE messenger_contact_settings SET new_numbers_day = new_numbers_day - 1 WHERE user_id = F;
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a2-0c', 'snapshot_chunk', NULL, c0, NULL, NULL, 0, 2);
  gen := (r->>'generation')::int;
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a2-1c', 'snapshot_chunk', NULL, c1, NULL, gen, 1, 2);
  PERFORM t_ok('F1-A2-4 다음 날 확정 (149개)', r->>'committed' = 'true'
    AND (SELECT count(*) FROM contact_source_entries WHERE source_id = sF) = 149, r::text);
  PERFORM t_ok('F1-A3-1 재시작에서 빠진 미확정 번호(y-gone) 삭제',
    NOT EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sF AND phone_hmac = t_h('y-gone')));

  -- ── A3: 확정된 번호 X(p1) 가 끊긴 시도에 들어간 뒤 폰에서 지워짐
  rev := (SELECT revision FROM messenger_contacts_admin_settings WHERE id = 1);
  PERFORM public.save_messenger_contacts_admin_settings_cas(rev, NULL, NULL, NULL, 3000, 1000, NULL, NULL, NULL, NULL);
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a3-0', 'snapshot_chunk', NULL,
        (SELECT jsonb_agg(jsonb_build_object('h', t_hex('p' || n), 'r', 'r' || n)) FROM generate_series(1, 74) n), NULL, NULL, 0, 2);
  -- 끊김 → 다시 시작 (p1 없음)
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a3-0b', 'snapshot_chunk', NULL,
        (SELECT jsonb_agg(jsonb_build_object('h', t_hex('p' || n), 'r', 'r' || n)) FROM generate_series(2, 74) n), NULL, NULL, 0, 2);
  gen := (r->>'generation')::int;
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-a3-1b', 'snapshot_chunk', NULL, c1, NULL, gen, 1, 2);
  PERFORM t_ok('F1-A3-2 확정 후 p1 삭제·나머지 유지', r->>'committed' = 'true'
    AND NOT EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sF AND phone_hmac = t_h('p1'))
    AND (SELECT count(*) FROM contact_source_entries WHERE source_id = sF) = 148, r::text);

  -- ── 목록: G·H·K 번호를 변경분으로 추가
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-lst-add', 'delta', (SELECT device_version FROM contact_sources WHERE id = sF),
        jsonb_build_array(jsonb_build_object('h', t_hex('g-phone'), 'r', 'ref-g'),
                          jsonb_build_object('h', t_hex('h-phone'), 'r', 'ref-h'),
                          jsonb_build_object('h', t_hex('k-phone'), 'r', 'ref-k')), NULL, NULL, NULL, NULL);
  r := public.cm_contacts_list(F, sF, NULL);
  PERFORM t_ok('F1-LST-1 G·H·K 표시 · known_refs 비어 있음', t_members(r) = ARRAY[G, H, K] AND r->'known_refs' = '[]'::jsonb, r::text);
  tok := r->>'token';

  -- §5-1 정지 계정 제외
  UPDATE profiles SET status = 'suspended' WHERE id = G;
  r := public.cm_contacts_list(F, sF, NULL);
  PERFORM t_ok('F1-LST-2 정지 계정 G 제외', t_members(r) = ARRAY[H, K], r::text);
  UPDATE profiles SET status = 'verified_user' WHERE id = G;

  -- A7 known_refs: G 친구 · H 내가 차단 · K 가 나를 차단(넣지 않음)
  INSERT INTO user_social_relations (owner_user_id, target_user_id, relation_type) VALUES (F, G, 'friend'), (F, H, 'blocked'), (K, F, 'blocked');
  r := public.cm_contacts_list(F, sF, NULL);
  PERFORM t_ok('F1-LST-3 친구·차단 목록 제외', t_members(r) = '{}'::uuid[], r::text);
  PERFORM t_ok('F1-LST-4 known_refs = 친구 G·내가 차단 H (나를 차단한 K 제외)',
    r->'known_refs' @> '["ref-g","ref-h"]'::jsonb AND NOT (r->'known_refs' @> '["ref-k"]'::jsonb)
    AND jsonb_array_length(r->'known_refs') = 2, r::text);
  DELETE FROM user_social_relations WHERE owner_user_id IN (F, K) AND target_user_id IN (F, G, H);
  INSERT INTO contact_suppressions (owner_user_id, target_user_id, reason) VALUES (F, H, 'hidden');
  r := public.cm_contacts_list(F, sF, NULL);
  PERFORM t_ok('F1-LST-5 숨김 H 는 known_refs', r->'known_refs' = '["ref-h"]'::jsonb, r::text);
  PERFORM t_ok('F1-LST-6 다른 출처 기준이면 known_refs 없음', public.cm_contacts_list(F, NULL, NULL)->'known_refs' = '[]'::jsonb);

  -- P2 토큰: 어드민 설정 저장(revision) → 토큰 바뀜
  tok := public.cm_contacts_list(F, sF, NULL)->>'token';
  rev := (SELECT revision FROM messenger_contacts_admin_settings WHERE id = 1);
  PERFORM public.save_messenger_contacts_admin_settings_cas(rev, NULL, NULL, NULL, NULL, NULL, NULL, 'mutual', NULL, NULL);
  r := public.cm_contacts_list(F, sF, tok);
  PERFORM t_ok('F1-TOK-1 어드민 revision 바뀌면 not_modified 아님', r->>'not_modified' IS NULL, r::text);
  tok2 := r->>'token';
  DELETE FROM member_phone_lookup WHERE user_id = F;
  r := public.cm_contacts_list(F, sF, tok2);
  PERFORM t_ok('F1-TOK-2 내 번호 등록 바뀌면 not_modified 아님', r->>'not_modified' IS NULL, r::text);
  rev := (SELECT revision FROM messenger_contacts_admin_settings WHERE id = 1);
  PERFORM public.save_messenger_contacts_admin_settings_cas(rev, NULL, NULL, NULL, NULL, NULL, NULL, 'everyone', NULL, NULL);

  -- 버려진 스냅숏: 2일 → 유지 · 4일 → 정리 + seen 초기화
  r := public.cm_contacts_apply(F, sF, rF, 'batch-f1-ab-0', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('z-new'), 'r', 'ref-z'),
                          jsonb_build_object('h', t_hex('p2'), 'r', 'r2')), NULL, NULL, 0, 2);
  UPDATE contact_sources SET pending_started_at = now() - interval '2 days' WHERE id = sF;
  PERFORM public.cm_contacts_daily_maintenance(false);
  PERFORM t_ok('F1-MNT-1 2일 된 미확정 유지', (SELECT pending_generation FROM contact_sources WHERE id = sF) IS NOT NULL
    AND EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sF AND phone_hmac = t_h('z-new')));
  UPDATE contact_sources SET pending_started_at = now() - interval '4 days' WHERE id = sF;
  r := public.cm_contacts_daily_maintenance(false);
  PERFORM t_ok('F1-MNT-2 4일 된 미확정 정리·seen 초기화·open_failures 반환',
    (SELECT pending_generation FROM contact_sources WHERE id = sF) IS NULL
    AND NOT EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sF AND phone_hmac = t_h('z-new'))
    AND NOT EXISTS (SELECT 1 FROM contact_source_entries e JOIN contact_sources s ON s.id = e.source_id
                    WHERE e.source_id = sF AND e.seen_generation <> s.generation)
    AND r ? 'open_failures', r::text);
  PERFORM t_ok('F1-MNT-3 정리 뒤 목록 그대로 (확정 번호 p2 유지)',
    EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sF AND phone_hmac = t_h('p2')));
END
$f1$;
