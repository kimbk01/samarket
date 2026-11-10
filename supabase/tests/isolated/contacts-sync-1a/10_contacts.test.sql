-- 연락처 동기화 1a — 기능 시험 (로컬 일회용 PG16). 결과: NOTICE 'PASS id' / ERROR 'FAIL id …' (첫 FAIL 에서 중단)
CREATE OR REPLACE FUNCTION t_ok(p_id text, p_cond boolean, p_detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF coalesce(p_cond, false) THEN RAISE NOTICE 'PASS %', p_id; ELSE RAISE EXCEPTION 'FAIL % %', p_id, p_detail; END IF;
END $$;
CREATE OR REPLACE FUNCTION t_h(p text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT sha256(convert_to(p, 'UTF8')) $$;
CREATE OR REPLACE FUNCTION t_hex(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
CREATE OR REPLACE FUNCTION t_members(p_list jsonb) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg((m->>'user_id')::uuid ORDER BY m->>'user_id'), '{}') FROM jsonb_array_elements(p_list->'members') m $$;

-- 회원: A(뷰어) B C(번호 없음) D E
INSERT INTO public.profiles (id, nickname, phone, phone_country_code, phone_verified, phone_verified_at, created_at) VALUES
 ('00000000-0000-0000-0000-00000000000a', 'A', '09170000001', '+63', true, now(), now() - interval '100 days'),
 ('00000000-0000-0000-0000-00000000000b', 'B', '09170000002', '+63', true, now(), now() - interval '1 day'),
 ('00000000-0000-0000-0000-00000000000c', 'C', NULL, NULL, true, now(), now() - interval '50 days'),
 ('00000000-0000-0000-0000-00000000000d', 'D', '+821000000004', '+82', true, now(), now() - interval '50 days'),
 ('00000000-0000-0000-0000-00000000000e', 'E', '09170000005', '+63', true, now(), now() - interval '50 days');

DO $t$
DECLARE
  A uuid := '00000000-0000-0000-0000-00000000000a';
  B uuid := '00000000-0000-0000-0000-00000000000b';
  C uuid := '00000000-0000-0000-0000-00000000000c';
  D uuid := '00000000-0000-0000-0000-00000000000d';
  E uuid := '00000000-0000-0000-0000-00000000000e';
  rA bytea := t_h('inst-A1'); rA2 bytea := t_h('inst-A2'); rB bytea := t_h('inst-B1');
  r jsonb; sA uuid; sA2 uuid; sB uuid; tok text; v bigint;
BEGIN
  -- 어드민 설정 revision 저장
  r := public.save_messenger_contacts_admin_settings_cas(0, true, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM t_ok('ADM-1 save rev0', r->>'ok' = 'true' AND (r->>'revision')::int = 1, r::text);
  r := public.save_messenger_contacts_admin_settings_cas(0, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM t_ok('ADM-2 stale revision 거부', r->>'error' = 'stale_revision' AND (SELECT enabled FROM messenger_contacts_admin_settings), r::text);
  r := public.save_messenger_contacts_admin_settings_cas(1, NULL, NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL);
  PERFORM t_ok('ADM-3 범위 밖 값 거부', r->>'error' = 'invalid_value', r::text);
  PERFORM t_ok('ADM-4 로그 1건', (SELECT count(*) FROM messenger_contacts_admin_settings_logs) = 1);

  -- 동의 전 출처 등록 불가
  r := public.cm_contacts_register_source(A, rA, 'android');
  PERFORM t_ok('SRC-1 동의 전 거부', r->>'error' = 'consent_required', r::text);

  -- 동의 (A·B·D·E 번호 등록, C 번호 없음)
  r := public.cm_contacts_consent(A, 'v1', t_h('+639170000001'), 1::smallint, now());
  PERFORM t_ok('CON-1 A 동의·등록', r->>'ok' = 'true' AND r->>'registered_phone' = 'true' AND r->>'join_notice_eligible' = 'false', r::text);
  r := public.cm_contacts_consent(B, 'v1', t_h('+639170000002'), 1::smallint, now());
  PERFORM t_ok('CON-2 B 신규 가입 안내 대상', r->>'join_notice_eligible' = 'true' AND r->>'first_registration' = 'true', r::text);
  r := public.cm_contacts_consent(C, 'v1', NULL, NULL, NULL);
  PERFORM t_ok('CON-3 C 번호 없이 동의', r->>'ok' = 'true' AND r->>'registered_phone' = 'false'
    AND NOT EXISTS (SELECT 1 FROM member_phone_lookup WHERE user_id = C), r::text);
  PERFORM public.cm_contacts_consent(D, 'v1', t_h('+821000000004'), 1::smallint, now());
  PERFORM public.cm_contacts_consent(E, 'v1', t_h('+639170000005'), 1::smallint, now());
  r := public.cm_contacts_consent(B, 'v1', t_h('+639170000002'), 1::smallint, now());
  PERFORM t_ok('CON-4 재동의는 첫 등록 아님', r->>'first_registration' = 'false', r::text);

  -- 출처 등록·재사용
  r := public.cm_contacts_register_source(A, rA, 'android');
  sA := (r->>'source_id')::uuid;
  PERFORM t_ok('SRC-2 A 출처 생성', r->>'created' = 'true' AND sA IS NOT NULL, r::text);
  r := public.cm_contacts_register_source(A, rA, 'android');
  PERFORM t_ok('SRC-3 같은 설치 재사용', (r->>'source_id')::uuid = sA AND r->>'created' = 'false', r::text);

  -- 첫 스냅숏 (B·D·비회원)
  r := public.cm_contacts_apply(A, sA, rA, 'batch-snap-1', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000002'), 'r', 'ref-b'),
                          jsonb_build_object('h', t_hex('+821000000004'), 'r', 'ref-d'),
                          jsonb_build_object('h', t_hex('+639999999999'), 'r', 'ref-x')),
        NULL, NULL, 0, 1);
  PERFORM t_ok('SNP-1 첫 스냅숏 확정', r->>'committed' = 'true' AND (r->>'generation')::int = 1, r::text);
  r := public.cm_contacts_list(A, sA, NULL);
  tok := r->>'token';
  PERFORM t_ok('LST-1 B·D 표시 (비회원 제외)', t_members(r) @> ARRAY[B, D] AND cardinality(t_members(r)) = 2, r::text);
  PERFORM t_ok('LST-2 이 기기 표시·client_ref', (SELECT bool_and((m->>'on_this_device')::boolean) FROM jsonb_array_elements(r->'members') m)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m WHERE m->>'client_ref' = 'ref-b'), r::text);
  PERFORM t_ok('LST-3 B 최근 가입', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = B AND (m->>'recently_joined')::boolean), r::text);
  r := public.cm_contacts_list(A, sA, tok);
  PERFORM t_ok('LST-4 같은 토큰 → not_modified', r->>'not_modified' = 'true', r::text);

  -- 중복 batch
  v := (SELECT device_version FROM contact_sources WHERE id = sA);
  r := public.cm_contacts_apply(A, sA, rA, 'batch-snap-1', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000005'), 'r', 'ref-e')), NULL, NULL, 0, 1);
  PERFORM t_ok('DUP-1 같은 batch_id → 저장 결과·쓰기 없음', r->>'duplicate' = 'true'
    AND (SELECT device_version FROM contact_sources WHERE id = sA) = v
    AND NOT EXISTS (SELECT 1 FROM contact_source_entries WHERE phone_hmac = t_h('+639170000005')), r::text);

  -- 늦은 업로드 (base_version 불일치)
  r := public.cm_contacts_apply(A, sA, rA, 'batch-delta-old', 'delta', v - 1,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000005'), 'r', 'ref-e')), NULL, NULL, NULL, NULL);
  PERFORM t_ok('VER-1 낡은 base_version → resync_required', r->>'error' = 'resync_required', r::text);

  -- 변경분: E 추가, B 삭제
  r := public.cm_contacts_apply(A, sA, rA, 'batch-delta-1', 'delta', v,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000005'), 'r', 'ref-e')),
        jsonb_build_array(t_hex('+639170000002')), NULL, NULL, NULL);
  PERFORM t_ok('DLT-1 변경분 반영', r->>'committed' = 'true' AND (r->>'device_version')::bigint = v + 1, r::text);
  r := public.cm_contacts_list(A, sA, tok);
  PERFORM t_ok('DLT-2 목록 변경(토큰 다름)·B 빠짐·E 추가', r->>'not_modified' IS NULL AND t_members(r) @> ARRAY[D, E]
    AND NOT t_members(r) @> ARRAY[B], r::text);

  -- 다중 기기: A2 에 B
  r := public.cm_contacts_register_source(A, rA2, 'ios');
  sA2 := (r->>'source_id')::uuid;
  PERFORM public.cm_contacts_apply(A, sA2, rA2, 'batch-a2-snap', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000002'), 'r', 'ref-b2')), NULL, NULL, 0, 1);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('MD-1 다른 기기 번호 포함·이 기기 아님', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = B AND NOT (m->>'on_this_device')::boolean AND m->>'client_ref' IS NULL), r::text);
  r := public.cm_contacts_list(A, sA2, NULL);
  PERFORM t_ok('MD-2 B 는 A2 에서 이 기기', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = B AND (m->>'on_this_device')::boolean AND m->>'client_ref' = 'ref-b2'), r::text);

  -- 소유권·설치 확인
  r := public.cm_contacts_apply(A, sA, rA2, 'batch-mismatch', 'delta', 0, '[]'::jsonb, NULL, NULL, NULL, NULL);
  PERFORM t_ok('SEC-1 다른 설치 값 → source_mismatch', r->>'error' = 'source_mismatch', r::text);
  r := public.cm_contacts_apply(B, sA, rA, 'batch-other-user', 'delta', 0, '[]'::jsonb, NULL, NULL, NULL, NULL);
  PERFORM t_ok('SEC-2 다른 회원 출처 → not_found', r->>'error' = 'not_found', r::text);
  r := public.cm_contacts_apply(A, sA, rA, 'batch-badhash', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA),
        jsonb_build_array(jsonb_build_object('h', 'ZZ', 'r', 'x')), NULL, NULL, NULL, NULL);
  PERFORM t_ok('SEC-3 잘못된 해시 거부', r->>'error' = 'bad_hash', r::text);

  -- 친구·차단·요청·제한
  INSERT INTO user_social_relations (owner_user_id, target_user_id, relation_type) VALUES (A, D, 'friend'), (D, A, 'friend');
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('FR-1 친구는 friend_ids 로', NOT t_members(r) @> ARRAY[D] AND r->'friend_ids' @> to_jsonb(ARRAY[D]), r::text);
  INSERT INTO community_friend_requests (requester_id, addressee_id, status) VALUES (A, E, 'pending');
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('FR-2 보낸 요청 상태', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'members') m
    WHERE (m->>'user_id')::uuid = E AND m->>'request_state' = 'sent'), r::text);
  INSERT INTO user_social_relations (owner_user_id, target_user_id, relation_type, is_active) VALUES (E, A, 'blocked', false);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('BLK-1 상대가 나를 차단했었음(해제 포함) → 제외', NOT t_members(r) @> ARRAY[E], r::text);
  DELETE FROM user_social_relations WHERE owner_user_id = E;
  INSERT INTO contact_suppressions (owner_user_id, target_user_id, reason) VALUES (A, B, 'hidden');
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('SUP-1 추천 숨김 제외', NOT t_members(r) @> ARRAY[B], r::text);
  DELETE FROM contact_suppressions;
  INSERT INTO contact_suppression_failures (owner_user_id, target_user_id, reason, sqlstate) VALUES (A, B, 'former_friend', 'XX000');
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('SUP-2 미복구 실패 행도 제외', NOT t_members(r) @> ARRAY[B], r::text);
  r := public.cm_contacts_daily_maintenance(false);
  PERFORM t_ok('SUP-3 정리 작업이 복구', (r->>'recovered_failures')::int = 1
    AND EXISTS (SELECT 1 FROM contact_suppressions WHERE owner_user_id = A AND target_user_id = B AND reason = 'former_friend')
    AND NOT EXISTS (SELECT 1 FROM contact_suppression_failures WHERE resolved_at IS NULL), r::text);
  r := public.cm_contacts_daily_maintenance(false);
  PERFORM t_ok('SUP-4 재실행 멱등', (r->>'recovered_failures')::int = 0
    AND (SELECT count(*) FROM contact_suppressions) = 1, r::text);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('SUP-5 복구 후에도 제외', NOT t_members(r) @> ARRAY[B], r::text);
  DELETE FROM contact_suppressions; DELETE FROM contact_suppression_failures;

  -- 번호로 나를 찾기
  UPDATE messenger_contact_settings SET discovery_policy = 'nobody' WHERE user_id = B;
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('DIS-1 nobody 제외', NOT t_members(r) @> ARRAY[B], r::text);
  UPDATE messenger_contact_settings SET discovery_policy = 'mutual' WHERE user_id = B;
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('DIS-2 mutual 인데 B 가 A 번호 없음 → 제외', NOT t_members(r) @> ARRAY[B], r::text);
  r := public.cm_contacts_register_source(B, rB, 'android'); sB := (r->>'source_id')::uuid;
  PERFORM public.cm_contacts_apply(B, sB, rB, 'batch-b-snap', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000001'), 'r', 'ref-a')), NULL, NULL, 0, 1);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('DIS-3 mutual 서로 저장 → 표시', t_members(r) @> ARRAY[B], r::text);
  UPDATE messenger_contact_settings SET discovery_policy = NULL WHERE user_id = B;

  -- 가입 안내 대상 계산 (B 번호를 가진 A)
  r := public.cm_contacts_match_new_member(B, 200);
  PERFORM t_ok('JN-1 A 가 대상', r->'owner_ids' @> to_jsonb(ARRAY[A]), r::text);
  INSERT INTO contact_join_notices (owner_user_id, joined_user_id) VALUES (A, B);
  r := public.cm_contacts_match_new_member(B, 200);
  PERFORM t_ok('JN-2 이미 보냄 → 제외', NOT (r->'owner_ids' @> to_jsonb(ARRAY[A])), r::text);

  -- 스냅숏 진행 중·부분 실패
  r := public.cm_contacts_apply(A, sA, rA, 'batch-snap2-0', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('+821000000004'), 'r', 'ref-d')), NULL, NULL, 0, 2);
  PERFORM t_ok('SNP-2 조각 1/2 미확정', r->>'committed' = 'false', r::text);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('SNP-3 확정 전 이전 세대 그대로 (E 유지)', t_members(r) @> ARRAY[E], r::text);
  r := public.cm_contacts_apply(A, sA, rA, 'batch-delta-during', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA),
        '[]'::jsonb, NULL, NULL, NULL, NULL);
  PERFORM t_ok('SNP-4 진행 중 변경분 → snapshot_in_progress', r->>'error' = 'snapshot_in_progress', r::text);
  r := public.cm_contacts_apply(A, sA, rA, 'batch-snap2-1', 'snapshot_chunk', NULL, '[]'::jsonb, NULL, 99, 1, 2);
  PERFORM t_ok('SNP-5 다른 세대 조각 거부', r->>'error' = 'snapshot_generation_mismatch', r::text);
  r := public.cm_contacts_apply(A, sA, rA, 'batch-snap2-1b', 'snapshot_chunk', NULL, '[]'::jsonb, NULL,
        (SELECT pending_generation FROM contact_sources WHERE id = sA), 1, 2);
  PERFORM t_ok('SNP-6 확정 → 다시 안 온 E 삭제·D 유지', r->>'committed' = 'true'
    AND NOT EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sA AND phone_hmac = t_h('+639170000005'))
    AND EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sA AND phone_hmac = t_h('+821000000004')), r::text);

  -- 재정렬 하루 3회
  PERFORM public.cm_contacts_apply(A, sA, rA, 'batch-rs-2', 'snapshot_chunk', NULL, '[]'::jsonb, NULL, NULL, 0, 1);
  PERFORM public.cm_contacts_apply(A, sA, rA, 'batch-rs-3', 'snapshot_chunk', NULL, '[]'::jsonb, NULL, NULL, 0, 1);
  r := public.cm_contacts_apply(A, sA, rA, 'batch-rs-4', 'snapshot_chunk', NULL, '[]'::jsonb, NULL, NULL, 0, 1);
  PERFORM t_ok('LIM-1 재정렬 4번째 → resync_limit', r->>'error' = 'resync_limit', r::text);

  -- 한도
  PERFORM public.save_messenger_contacts_admin_settings_cas(1, NULL, NULL, NULL, 100, 100, NULL, NULL, NULL, NULL);
  r := public.cm_contacts_apply(A, sA2, rA2, 'batch-toomany', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA2),
        (SELECT jsonb_agg(jsonb_build_object('h', t_hex('n' || g), 'r', 'r' || g)) FROM generate_series(1, 101) g), NULL, NULL, NULL, NULL);
  PERFORM t_ok('LIM-2 요청당 번호 한도', r->>'error' = 'too_many', r::text);
  UPDATE messenger_contact_settings SET new_numbers_day = (now() AT TIME ZONE 'Asia/Manila')::date, new_numbers_count = 50 WHERE user_id = A;
  r := public.cm_contacts_apply(A, sA2, rA2, 'batch-daily', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA2),
        (SELECT jsonb_agg(jsonb_build_object('h', t_hex('m' || g), 'r', 'r' || g)) FROM generate_series(1, 60) g), NULL, NULL, NULL, NULL);
  PERFORM t_ok('LIM-3 하루 신규 번호 한도', r->>'error' = 'daily_limit', r::text);
  PERFORM public.save_messenger_contacts_admin_settings_cas(2, NULL, NULL, NULL, 3000, 1000, NULL, NULL, NULL, NULL);

  -- 이 기기 끄기·권한 철회 (#19)
  PERFORM public.cm_contacts_patch_source(A, sA2, rA2, false, NULL, NULL);
  r := public.cm_contacts_apply(A, sA2, rA2, 'batch-off', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA2), '[]'::jsonb, NULL, NULL, NULL, NULL);
  PERFORM t_ok('DEV-1 이 기기 끔 → device_sync_off', r->>'error' = 'device_sync_off', r::text);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('DEV-2 끈 기기 번호는 계속 포함 (B)', t_members(r) @> ARRAY[B], r::text);
  PERFORM public.cm_contacts_patch_source(A, sA2, rA2, true, 'denied', NULL);
  r := public.cm_contacts_apply(A, sA2, rA2, 'batch-denied', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA2), '[]'::jsonb, NULL, NULL, NULL, NULL);
  PERFORM t_ok('REV-1 권한 철회 → 업로드 거부', r->>'error' = 'permission_denied', r::text);
  r := public.cm_contacts_patch_source(A, sA2, rA2, NULL, NULL, 'keep');
  PERFORM t_ok('REV-2 유지 선택 기록', (SELECT revoke_choice FROM contact_sources WHERE id = sA2) = 'keep'
    AND EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sA2), r::text);
  r := public.cm_contacts_patch_source(A, sA2, rA2, NULL, NULL, 'delete');
  PERFORM t_ok('REV-3 지우기 선택 → 이 기기만 삭제', r->>'removed' = 'true'
    AND NOT EXISTS (SELECT 1 FROM contact_source_entries WHERE source_id = sA2)
    AND (SELECT status FROM contact_sources WHERE id = sA2) = 'removed'
    AND (SELECT status FROM contact_sources WHERE id = sA) = 'active', r::text);
  r := public.cm_contacts_register_source(A, rA2, 'ios');
  PERFORM t_ok('REV-4 같은 설치 재등록 → 재사용·버전 올림', (r->>'source_id')::uuid = sA2 AND r->>'reactivated' = 'true', r::text);
  r := public.cm_contacts_apply(A, sA2, rA2, 'batch-a2-resnap', 'snapshot_chunk', NULL,
        jsonb_build_array(jsonb_build_object('h', t_hex('+639170000002'), 'r', 'ref-b2')), NULL, NULL, 0, 1);
  PERFORM t_ok('REV-5 재등록 후 전체 스냅숏', r->>'committed' = 'true', r::text);

  -- 계정 전체 동기화 끄기
  UPDATE messenger_contact_settings SET account_sync_enabled = false WHERE user_id = A;
  r := public.cm_contacts_apply(A, sA, rA, 'batch-acc-off', 'delta', (SELECT device_version FROM contact_sources WHERE id = sA), '[]'::jsonb, NULL, NULL, NULL, NULL);
  PERFORM t_ok('ACC-1 계정 끔 → account_sync_off', r->>'error' = 'account_sync_off', r::text);
  r := public.cm_contacts_list(A, sA, NULL);
  PERFORM t_ok('ACC-2 목록 숨김', r->>'account_sync_off' = 'true' AND jsonb_array_length(r->'members') = 0, r::text);
  r := public.cm_contacts_match_new_member(B, 200);
  DELETE FROM contact_join_notices;
  r := public.cm_contacts_match_new_member(B, 200);
  PERFORM t_ok('ACC-3 계정 끔 → 가입 매칭 제외', NOT (r->'owner_ids' @> to_jsonb(ARRAY[A])), r::text);
  UPDATE messenger_contact_settings SET account_sync_enabled = true WHERE user_id = A;

  -- 번호 변경 (B) → A 버전 올림
  v := (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = A);
  r := public.cm_contacts_lookup_upsert(B, t_h('+639170000099'), 1::smallint, now());
  PERFORM t_ok('PH-1 번호 변경 → 옛 번호 저장한 A 버전 올림', r->>'changed' = 'true'
    AND (SELECT account_list_version FROM messenger_contact_settings WHERE user_id = A) > v, r::text);

  -- 동의 철회 (B)
  r := public.cm_contacts_withdraw(B);
  PERFORM t_ok('WD-1 철회 → 등록·출처 삭제', NOT EXISTS (SELECT 1 FROM member_phone_lookup WHERE user_id = B)
    AND NOT EXISTS (SELECT 1 FROM contact_sources WHERE user_id = B AND status = 'active')
    AND (SELECT withdrawn_at IS NOT NULL FROM messenger_contact_settings WHERE user_id = B), r::text);
  r := public.cm_contacts_register_source(B, rB, 'android');
  PERFORM t_ok('WD-2 철회 후 등록 불가', r->>'error' = 'consent_required', r::text);

  -- 계정 전체 연락처 삭제 (A)
  r := public.cm_contacts_delete_all(A);
  PERFORM t_ok('DEL-1 전체 삭제', NOT EXISTS (SELECT 1 FROM contact_source_entries e JOIN contact_sources s ON s.id = e.source_id WHERE s.user_id = A), r::text);

  -- 미사용 정리
  r := public.cm_contacts_register_source(A, rA, 'android');
  UPDATE contact_sources SET last_used_at = now() - interval '200 days' WHERE id = sA;
  r := public.cm_contacts_daily_maintenance(true);
  PERFORM t_ok('IDLE-1 dry_run 은 건수만', (r->>'idle_sources')::int = 1 AND (SELECT status FROM contact_sources WHERE id = sA) = 'active', r::text);
  r := public.cm_contacts_daily_maintenance(false);
  PERFORM t_ok('IDLE-2 180일 미사용 출처 정리', (SELECT status FROM contact_sources WHERE id = sA) = 'removed', r::text);

  -- 계정 삭제 연쇄
  DELETE FROM profiles WHERE id = E;
  PERFORM t_ok('CAS-1 계정 삭제 연쇄', NOT EXISTS (SELECT 1 FROM member_phone_lookup WHERE user_id = E)
    AND NOT EXISTS (SELECT 1 FROM messenger_contact_settings WHERE user_id = E));
END
$t$;

-- 권한: authenticated·anon 은 표·함수 모두 불가
DO $g$
BEGIN
  PERFORM t_ok('GRANT-1 authenticated 표 SELECT 불가', NOT has_table_privilege('authenticated', 'public.contact_source_entries', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.member_phone_lookup', 'SELECT'));
  PERFORM t_ok('GRANT-2 authenticated 함수 실행 불가',
    NOT has_function_privilege('authenticated', 'public.cm_contacts_list(uuid, uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.cm_contacts_apply(uuid, uuid, bytea, text, text, bigint, jsonb, jsonb, integer, integer, integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.cm_contacts_list(uuid, uuid, text)', 'EXECUTE'));
  PERFORM t_ok('GRANT-3 RLS 켜짐', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN
    ('member_phone_lookup','messenger_contact_settings','contact_sources','contact_source_entries','contact_suppressions',
     'contact_suppression_failures','contact_join_notices','messenger_contacts_admin_settings','messenger_contacts_admin_settings_logs')));
END
$g$;
