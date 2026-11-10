-- F3 시험 (20271111140000 적용 후) — 삭제 유지·재개 · 상대 쪽 변화 목록 버전 · 철회 시 제한 삭제 · 실패분 복구 · 이어 올리기 · 서로 저장 판정 · friend_refs
INSERT INTO public.profiles (id, nickname, phone, phone_country_code, phone_verified, phone_verified_at, created_at) VALUES
 ('00000000-0000-0000-0000-0000000000b1', 'X1', '09170000031', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000b2', 'X2', '09170000032', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-0000000000b3', 'X3', '09170000033', '+63', true, now(), now() - interval '100 days');

DO $f3$
DECLARE
  X uuid := '00000000-0000-0000-0000-0000000000b1';
  Y uuid := '00000000-0000-0000-0000-0000000000b2';
  Z uuid := '00000000-0000-0000-0000-0000000000b3';
  rX bytea := t_h('inst-X1'); rY bytea := t_h('inst-Y1');
  r jsonb; sX uuid; sY uuid; v bigint; gen int;
BEGIN
  PERFORM public.cm_contacts_consent(X, 'v1', t_h('x-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(Y, 'v1', t_h('y-phone'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(Z, 'v1', t_h('z-phone'), 1::smallint, now());
  sX := (public.cm_contacts_register_source(X, rX, 'android')->>'source_id')::uuid;
  sY := (public.cm_contacts_register_source(Y, rY, 'ios')->>'source_id')::uuid;
  -- X 연락처: Y·Z / Y 연락처: X
  PERFORM public.cm_contacts_apply(X, sX, rX, 'batch-f3-x', 'snapshot_chunk', NULL,
    jsonb_build_array(jsonb_build_object('h', t_hex('y-phone'), 'r', 'ref-y'), jsonb_build_object('h', t_hex('z-phone'), 'r', 'ref-z')), NULL, NULL, 0, 1);
  PERFORM public.cm_contacts_apply(Y, sY, rY, 'batch-f3-y', 'snapshot_chunk', NULL,
    jsonb_build_array(jsonb_build_object('h', t_hex('x-phone'), 'r', 'ref-x')), NULL, NULL, 0, 1);

  -- ── A9: 회원이 지운 출처는 하루 갱신으로 되살아나지 않음
  PERFORM public.cm_contacts_delete_source(X, sX);
  r := public.cm_contacts_register_source(X, rX, 'android');
  PERFORM t_ok('F3-A9-1 지운 출처 → 재등록해도 removed 유지', r->>'removed' = 'true' AND r->>'removed_by' = 'user'
    AND (SELECT status FROM contact_sources WHERE id = sX) = 'removed', r::text);
  r := public.cm_contacts_apply(X, sX, rX, 'batch-f3-x2', 'snapshot_chunk', NULL, '[]'::jsonb, NULL, NULL, 0, 1);
  PERFORM t_ok('F3-A9-2 지운 출처 업로드 거부', r->>'error' = 'source_inactive', r::text);
  r := public.cm_contacts_register_source(X, rX, 'android', true);
  PERFORM t_ok('F3-A9-3 그 기기에서 다시 켬(p_reactivate) → 재개', r->>'reactivated' = 'true' AND r->>'removed' = 'false'
    AND (SELECT status FROM contact_sources WHERE id = sX) = 'active' AND (SELECT removed_by FROM contact_sources WHERE id = sX) IS NULL, r::text);
  UPDATE contact_sources SET status = 'removed', removed_by = 'idle' WHERE id = sX;
  r := public.cm_contacts_register_source(X, rX, 'android');
  PERFORM t_ok('F3-A9-4 180일 정리(idle) 출처는 다시 실행하면 자동 재개 (§8)', r->>'reactivated' = 'true', r::text);
  PERFORM public.cm_contacts_delete_all(X);
  PERFORM t_ok('F3-A9-5 전체 삭제 = removed_by user', (SELECT removed_by FROM contact_sources WHERE id = sX) = 'user');
  PERFORM public.cm_contacts_register_source(X, rX, 'android', true);
  PERFORM public.cm_contacts_apply(X, sX, rX, 'batch-f3-x3', 'snapshot_chunk', NULL,
    jsonb_build_array(jsonb_build_object('h', t_hex('y-phone'), 'r', 'ref-y'), jsonb_build_object('h', t_hex('z-phone'), 'r', 'ref-z')), NULL, NULL, 0, 1);

  -- ── P2: 상대 쪽 변화 → X 목록 버전 오름
  v := (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X);
  UPDATE profiles SET nickname = 'Y-new' WHERE id = Y;
  PERFORM t_ok('F3-P2-1 상대 닉네임 변경 → 내 목록 버전 +', (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X) > v);
  v := (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X);
  UPDATE profiles SET phone_verified_at = now() - interval '1 day' WHERE id = Y;
  PERFORM t_ok('F3-P2-2 상관없는 열 변경은 그대로', (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X) = v);
  UPDATE messenger_contact_settings SET discovery_policy = 'nobody' WHERE user_id = Y;
  PERFORM t_ok('F3-P2-3 상대 공개 범위 변경 → 버전 +', (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X) > v);
  v := (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X);
  DELETE FROM member_phone_lookup WHERE user_id = Z;
  PERFORM t_ok('F3-P2-4 상대 번호 등록 삭제(매일 정리·탈퇴) → 버전 +', (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = X) > v);
  PERFORM public.cm_contacts_lookup_upsert(Z, t_h('z-phone'), 1::smallint, now());
  UPDATE messenger_contact_settings SET discovery_policy = NULL WHERE user_id = Y;

  -- 「서로 저장」 올린 사람의 번호 추가·삭제 → 그 번호 회원 버전 +
  UPDATE messenger_contact_settings SET discovery_policy = 'mutual' WHERE user_id = X;
  v := (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = Y);
  r := public.cm_contacts_apply(X, sX, rX, 'batch-f3-mut1', 'delta', (SELECT device_version FROM contact_sources WHERE id = sX),
        NULL, jsonb_build_array(t_hex('y-phone')), NULL, NULL, NULL);
  PERFORM t_ok('F3-P2-5 mutual X 가 Y 번호 삭제 → Y 목록 버전 +', r->>'ok' = 'true'
    AND (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = Y) > v, r::text);
  r := public.cm_contacts_list(Y, sY, NULL);
  PERFORM t_ok('F3-P2-6 Y 목록에서 X 사라짐 (X 가 Y 번호 없음)', NOT (t_members(r) @> ARRAY[X]), r::text);
  v := (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = Y);
  r := public.cm_contacts_apply(X, sX, rX, 'batch-f3-mut2', 'delta', (SELECT device_version FROM contact_sources WHERE id = sX),
        jsonb_build_array(jsonb_build_object('h', t_hex('y-phone'), 'r', 'ref-y')), NULL, NULL, NULL, NULL);
  r := public.cm_contacts_list(Y, sY, NULL);
  PERFORM t_ok('F3-P2-7 다시 추가 → Y 버전 + · X 다시 보임',
    (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = Y) > v AND t_members(r) @> ARRAY[X], r::text);
  -- L2: 상대가 계정 동기화 끄면 「서로 저장」 아님
  UPDATE messenger_contact_settings SET account_sync_enabled = false WHERE user_id = X;
  r := public.cm_contacts_list(Y, sY, NULL);
  PERFORM t_ok('F3-L2 mutual 상대가 계정 동기화 끔 → 안 보임', NOT (t_members(r) @> ARRAY[X]), r::text);
  UPDATE messenger_contact_settings SET account_sync_enabled = true, discovery_policy = NULL WHERE user_id = X;

  -- friend_refs
  INSERT INTO user_social_relations (owner_user_id, target_user_id, relation_type) VALUES (X, Y, 'friend');
  r := public.cm_contacts_list(X, sX, NULL);
  PERFORM t_ok('F3-FR 친구 Y 의 이 기기 표시값', r->'friend_refs'->>Y::text = 'ref-y' AND NOT (t_members(r) @> ARRAY[Y]), r::text);
  DELETE FROM user_social_relations WHERE owner_user_id = X AND target_user_id = Y;

  -- ── 이어 올리기: 조각 1 이 진행 시각 갱신
  r := public.cm_contacts_apply(X, sX, rX, 'batch-f3-res0', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('y-phone'), 'r', 'ref-y')), NULL, NULL, 0, 3);
  gen := (r->>'generation')::int;
  UPDATE contact_sources SET pending_started_at = now() - interval '2 days' WHERE id = sX;
  r := public.cm_contacts_apply(X, sX, rX, 'batch-f3-res1', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('z-phone'), 'r', 'ref-z')), NULL, gen, 1, 3);
  PERFORM t_ok('F3-RES-1 이어 올린 조각 → 진행 시각 갱신', r->>'ok' = 'true'
    AND (SELECT pending_started_at FROM contact_sources WHERE id = sX) > now() - interval '1 minute', r::text);
  r := public.cm_contacts_apply(X, sX, rX, 'batch-f3-res2', 'snapshot_chunk', NULL, '[]'::jsonb, NULL, gen, 2, 3);
  PERFORM t_ok('F3-RES-2 마지막 조각 확정', r->>'committed' = 'true', r::text);

  -- ── §5-3 복구: 행마다 따로 · 실패 횟수 · 경고
  ALTER TABLE contact_suppressions ADD CONSTRAINT t_no_self CHECK (owner_user_id <> target_user_id);
  INSERT INTO contact_suppression_failures (owner_user_id, target_user_id, reason) VALUES (X, X, 'former_friend'), (X, Z, 'former_friend');
  r := public.cm_contacts_recover_failures();
  PERFORM t_ok('F3-REC-1 한 행 실패해도 다른 행 복구', (r->>'recovered')::int = 1 AND (r->>'failed')::int = 1
    AND EXISTS (SELECT 1 FROM contact_suppressions WHERE owner_user_id = X AND target_user_id = Z)
    AND (SELECT last_error FROM contact_suppression_failures WHERE owner_user_id = X AND target_user_id = X) IS NOT NULL, r::text);
  PERFORM public.cm_contacts_recover_failures();
  r := public.cm_contacts_daily_maintenance(false);
  PERFORM t_ok('F3-REC-2 3회 실패 → 경고 1 · 정리 작업은 계속 · 트리거 상태 기록',
    (r->>'warn_failures')::int = 1 AND (r->>'open_failures')::int = 1 AND r ? 'trigger_enabled', r::text);
  ALTER TABLE contact_suppressions DROP CONSTRAINT t_no_self;

  -- ── §8 동의 철회 = 내 재추천 제한 삭제
  PERFORM public.cm_contacts_withdraw(X);
  PERFORM t_ok('F3-WD 철회 → 내 제한·실패 행 삭제 · 출처 removed_by withdraw',
    NOT EXISTS (SELECT 1 FROM contact_suppressions WHERE owner_user_id = X)
    AND NOT EXISTS (SELECT 1 FROM contact_suppression_failures WHERE owner_user_id = X)
    AND (SELECT removed_by FROM contact_sources WHERE id = sX) = 'withdraw');
  PERFORM t_ok('F3-GRANT 새 함수 authenticated 실행 불가',
    NOT has_function_privilege('authenticated', 'public.cm_contacts_recover_failures()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.cm_contacts_register_source(uuid, bytea, text, boolean)', 'EXECUTE'));
END
$f3$;

DO $f3b$
DECLARE
  X uuid := '00000000-0000-0000-0000-0000000000b1';
  Y uuid := '00000000-0000-0000-0000-0000000000b2';
  Z uuid := '00000000-0000-0000-0000-0000000000b3';
  r jsonb; ids uuid[]; c jsonb;
BEGIN
  -- 가입 안내 일괄 기록: 새로 기록된 회원만, 두 번째는 0
  ids := public.cm_contacts_record_join_notices(Z, ARRAY[X, Y, X]);
  PERFORM t_ok('F3-JN-1 일괄 기록 2명', cardinality(ids) = 2);
  ids := public.cm_contacts_record_join_notices(Z, ARRAY[X, Y]);
  PERFORM t_ok('F3-JN-2 다시 부르면 0 (1회 보장)', cardinality(ids) = 0);
  -- 번호 등록 일괄: 등록 불가 번호는 삭제 + 다시 고르지 않음
  UPDATE messenger_contact_settings SET withdrawn_at = NULL, consented_at = now() WHERE user_id = Y;
  UPDATE member_phone_lookup SET phone_verified_at_snapshot = now() - interval '9 days' WHERE user_id = Y;
  r := public.cm_contacts_lookup_refresh_candidates(500);
  PERFORM t_ok('F3-LK-1 Y 후보', EXISTS (SELECT 1 FROM jsonb_array_elements(r) el WHERE (el->>'user_id')::uuid = Y), r::text);
  r := public.cm_contacts_lookup_upsert_many(jsonb_build_array(jsonb_build_object('u', Y, 'h', NULL, 'v', (SELECT phone_verified_at FROM profiles WHERE id = Y))), 1::smallint);
  PERFORM t_ok('F3-LK-2 등록 불가 → 삭제', (r->>'unusable')::int = 1 AND NOT EXISTS (SELECT 1 FROM member_phone_lookup WHERE user_id = Y), r::text);
  r := public.cm_contacts_lookup_refresh_candidates(500);
  PERFORM t_ok('F3-LK-3 같은 인증 시각이면 다시 고르지 않음', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r) el WHERE (el->>'user_id')::uuid = Y), r::text);
  r := public.cm_contacts_lookup_upsert_many(jsonb_build_array(jsonb_build_object('u', Y, 'h', t_hex('y-phone'), 'v', now())), 1::smallint);
  PERFORM t_ok('F3-LK-4 정상 번호 일괄 등록', (r->>'refreshed')::int = 1 AND EXISTS (SELECT 1 FROM member_phone_lookup WHERE user_id = Y), r::text);
  -- 출처별 개수 한 번에
  c := public.cm_contacts_source_entry_counts(ARRAY(SELECT id FROM contact_sources WHERE user_id IN (X, Y)));
  PERFORM t_ok('F3-CNT 출처별 개수', (c->>(SELECT id::text FROM contact_sources WHERE user_id = Y LIMIT 1))::int = 1, c::text);
END
$f3b$;
