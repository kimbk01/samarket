-- 연락처 동기화 1a — 규모 측정 (로컬 일회용 PG16 · 합성 데이터). 운영 측정값이 아니다.
-- 가정: 회원 10만 (모두 동의·번호 등록) · 연락처 올린 회원 2,000명 × 500번호 (+ 뷰어 2기기 × 500) ≈ 100만 행
--       번호의 30% 가 회원 · 인기 번호 1개를 1,000명이 저장 · 친구·요청 관계 10만 행
\timing off
TRUNCATE contact_source_entries, contact_sources, contact_join_notices, contact_suppressions, contact_suppression_failures,
  member_phone_lookup, messenger_contact_settings CASCADE;
DELETE FROM user_social_relations; DELETE FROM community_friend_requests; DELETE FROM profiles;

INSERT INTO profiles (id, nickname, phone, phone_country_code, phone_verified, phone_verified_at, created_at)
SELECT ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid, 'u' || g, '0917' || lpad(g::text, 7, '0'), '+63', true, now(), now() - interval '30 days'
FROM generate_series(1, 100000) g;
INSERT INTO member_phone_lookup (user_id, phone_hmac, key_version, phone_verified_at_snapshot)
SELECT ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid, sha256(convert_to('n' || g, 'UTF8')), 1, now()
FROM generate_series(1, 100000) g;
INSERT INTO messenger_contact_settings (user_id, consented_at, consent_version)
SELECT user_id, now(), 'v1' FROM member_phone_lookup;

-- 출처: 회원 1..2000 각 1기기, 뷰어(회원 1) 는 2기기
INSERT INTO contact_sources (id, user_id, install_ref, platform, generation)
SELECT ('00000000-0000-0000-0002-' || lpad(to_hex(g), 12, '0'))::uuid,
       ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid, sha256(convert_to('inst' || g, 'UTF8')), 'android', 1
FROM generate_series(1, 2000) g;
INSERT INTO contact_sources (id, user_id, install_ref, platform, generation)
VALUES ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000001', sha256(convert_to('inst-v2', 'UTF8')), 'ios', 1);
-- 번호: 30% 회원(n1..n100000 범위) · 70% 비회원(x…)
INSERT INTO contact_source_entries (source_id, phone_hmac, client_ref, generation, seen_generation)
SELECT s.id,
       CASE WHEN (k % 10) < 3 THEN sha256(convert_to('n' || (1 + ((g * 7919 + k * 104729) % 100000)), 'UTF8'))
            ELSE sha256(convert_to('x' || g || ':' || k, 'UTF8')) END,
       'r' || k, 1, 1
FROM generate_series(1, 2000) g
JOIN contact_sources s ON s.id = ('00000000-0000-0000-0002-' || lpad(to_hex(g), 12, '0'))::uuid
CROSS JOIN generate_series(1, 500) k
ON CONFLICT DO NOTHING;
INSERT INTO contact_source_entries (source_id, phone_hmac, client_ref, generation, seen_generation)
SELECT '00000000-0000-0000-0003-000000000001', sha256(convert_to('n' || (50000 + k), 'UTF8')), 'v' || k, 1, 1
FROM generate_series(1, 500) k ON CONFLICT DO NOTHING;
-- 인기 번호 (회원 99999) 를 1,000명이 저장
INSERT INTO contact_source_entries (source_id, phone_hmac, client_ref, generation, seen_generation)
SELECT ('00000000-0000-0000-0002-' || lpad(to_hex(g), 12, '0'))::uuid, sha256(convert_to('n99999', 'UTF8')), 'pop', 1, 1
FROM generate_series(1, 1000) g ON CONFLICT DO NOTHING;
-- 친구·요청 관계
INSERT INTO user_social_relations (owner_user_id, target_user_id, relation_type)
SELECT ('00000000-0000-0000-0001-' || lpad(to_hex(1 + (g % 100000)), 12, '0'))::uuid,
       ('00000000-0000-0000-0001-' || lpad(to_hex(1 + ((g * 31) % 100000)), 12, '0'))::uuid, 'friend'
FROM generate_series(1, 100000) g ON CONFLICT DO NOTHING;
INSERT INTO community_friend_requests (requester_id, addressee_id, status)
SELECT ('00000000-0000-0000-0001-' || lpad(to_hex(1 + (g % 100000)), 12, '0'))::uuid,
       ('00000000-0000-0000-0001-' || lpad(to_hex(1 + ((g * 17) % 100000)), 12, '0'))::uuid, 'pending'
FROM generate_series(1, 20000) g ON CONFLICT DO NOTHING;
ANALYZE;

DO $s$
DECLARE
  V uuid := '00000000-0000-0000-0001-000000000001';
  SV uuid := '00000000-0000-0000-0002-000000000001';
  t0 timestamptz; i int; r jsonb; tok text; n int;
  ms_list numeric; ms_nm numeric; ms_delta numeric; ms_snap numeric; ms_match numeric; ms_maint numeric;
BEGIN
  RAISE NOTICE 'SCALE entries=% lookups=% sources=% db=%',
    (SELECT count(*) FROM contact_source_entries), (SELECT count(*) FROM member_phone_lookup),
    (SELECT count(*) FROM contact_sources), pg_size_pretty(pg_database_size(current_database()));
  RAISE NOTICE 'SCALE size entries=% (heap+idx) lookup=%',
    pg_size_pretty(pg_total_relation_size('contact_source_entries')), pg_size_pretty(pg_total_relation_size('member_phone_lookup'));
  RAISE NOTICE 'SCALE bytes/entry=%', round(pg_total_relation_size('contact_source_entries')::numeric / greatest((SELECT count(*) FROM contact_source_entries), 1));

  r := public.cm_contacts_list(V, SV, NULL); -- 예열
  t0 := clock_timestamp();
  FOR i IN 1..20 LOOP r := public.cm_contacts_list(V, SV, NULL); END LOOP;
  ms_list := extract(epoch FROM clock_timestamp() - t0) * 1000 / 20;
  n := jsonb_array_length(r->'members') + jsonb_array_length(r->'friend_ids');
  tok := r->>'token';
  t0 := clock_timestamp();
  FOR i IN 1..50 LOOP r := public.cm_contacts_list(V, SV, tok); END LOOP;
  ms_nm := extract(epoch FROM clock_timestamp() - t0) * 1000 / 50;
  RAISE NOTICE 'SCALE list(full, % matched) avg=% ms · list(not_modified) avg=% ms', n, round(ms_list, 2), round(ms_nm, 3);

  t0 := clock_timestamp();
  FOR i IN 1..10 LOOP
    r := public.cm_contacts_apply(V, SV, sha256(convert_to('inst1', 'UTF8')), 'scale-delta-' || i, 'delta',
      (SELECT device_version FROM contact_sources WHERE id = SV),
      (SELECT jsonb_agg(jsonb_build_object('h', encode(sha256(convert_to('d' || i || ':' || k, 'UTF8')), 'hex'), 'r', 'd' || k)) FROM generate_series(1, 50) k),
      NULL, NULL, NULL, NULL);
    IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'FAIL scale delta %', r; END IF;
  END LOOP;
  ms_delta := extract(epoch FROM clock_timestamp() - t0) * 1000 / 10;

  t0 := clock_timestamp();
  r := public.cm_contacts_apply(V, SV, sha256(convert_to('inst1', 'UTF8')), 'scale-snap', 'snapshot_chunk', NULL,
      (SELECT jsonb_agg(jsonb_build_object('h', encode(sha256(convert_to('s' || k, 'UTF8')), 'hex'), 'r', 's' || k)) FROM generate_series(1, 1000) k),
      NULL, NULL, 0, 1);
  ms_snap := extract(epoch FROM clock_timestamp() - t0) * 1000;
  IF r->>'committed' <> 'true' THEN RAISE EXCEPTION 'FAIL scale snapshot %', r; END IF;
  RAISE NOTICE 'SCALE apply delta(50 adds) avg=% ms · snapshot(1,000 numbers, 1 chunk) =% ms', round(ms_delta, 2), round(ms_snap, 1);

  t0 := clock_timestamp();
  r := public.cm_contacts_match_new_member(('00000000-0000-0000-0001-' || lpad(to_hex(99999), 12, '0'))::uuid, 200);
  ms_match := extract(epoch FROM clock_timestamp() - t0) * 1000;
  RAISE NOTICE 'SCALE match_new_member(popular, % owners, cap 200) =% ms', jsonb_array_length(r->'owner_ids'), round(ms_match, 1);

  t0 := clock_timestamp();
  r := public.cm_contacts_daily_maintenance(true);
  ms_maint := extract(epoch FROM clock_timestamp() - t0) * 1000;
  RAISE NOTICE 'SCALE daily_maintenance(dry_run) =% ms %', round(ms_maint, 1), r;
END
$s$;
