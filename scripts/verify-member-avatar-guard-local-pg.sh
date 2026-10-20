#!/usr/bin/env bash
# D1 M1a 검증 — 컨테이너 안 임시 로컬 Postgres 에서만 실행한다.
# 운영 DB·테스트 DB(dibay-test, dibay-reset-qa)에 접속하지 않는다.
# 사용: bash scripts/verify-member-avatar-guard-local-pg.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20270525120000_member_avatar_url_guard.sql"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
PORT="${PGPORT_LOCAL:-55432}"
PGUSER_LOCAL=postgres

cleanup() {
  su postgres -c "$PG_BIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

chown postgres "$WORK" 2>/dev/null || true
su postgres -c "$PG_BIN/initdb -D $WORK/data -A trust -U $PGUSER_LOCAL" >/dev/null
su postgres -c "$PG_BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start" >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U "$PGUSER_LOCAL" -d postgres -v ON_ERROR_STOP=1 -q -X)

# Supabase 최소 스텁: 역할 + auth.uid()/auth.role()/auth.jwt() (Supabase 정의와 같은 방식으로 request.jwt.* 설정을 읽음)
"${PSQL[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (auth.jwt() ->> 'sub'))::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (auth.jwt() ->> 'role'))::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  nickname text,
  bio text,
  avatar_url text
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, service_role;
SQL

"${PSQL[@]}" -f "$MIGRATION"

"${PSQL[@]}" <<'SQL'
\set A '11111111-1111-4111-8111-111111111111'
\set B '22222222-2222-4222-8222-222222222222'
\set OWN_A 'https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/11111111-1111-4111-8111-111111111111/profile/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg'
\set OWN_B 'https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/22222222-2222-4222-8222-222222222222/profile/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg'
\set POST_B 'https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/22222222-2222-4222-8222-222222222222/posts/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg'
\set GOOGLE 'https://lh3.googleusercontent.com/a/abc=s96-c'

CREATE TEMP TABLE results(case_name text, expected text, actual text);
GRANT ALL ON results TO authenticated, service_role;

-- 시드: 서버(JWT 없음)로 A=구글 사진, B=본인 사진
INSERT INTO public.profiles(id, nickname, avatar_url) VALUES (:'A', 'alice', :'GOOGLE'), (:'B', 'bob', :'OWN_B');

CREATE FUNCTION pg_temp.try_update(p_case text, p_expected text, p_role text, p_sub uuid, p_target uuid, p_url text, p_nickname_only boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE r text; v_old_avatar text; v_old_nick text;
BEGIN
  SELECT avatar_url, nickname INTO v_old_avatar, v_old_nick FROM public.profiles WHERE id = p_target;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    IF p_nickname_only THEN
      UPDATE public.profiles SET nickname = 'renamed' WHERE id = p_target;
    ELSE
      UPDATE public.profiles SET avatar_url = p_url WHERE id = p_target;
    END IF;
    r := 'allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    r := 'rejected:' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  -- 다음 사례를 위해 원래 값 복구 (JWT 없는 세션 = 트리거 검사 제외)
  UPDATE public.profiles SET avatar_url = v_old_avatar, nickname = v_old_nick WHERE id = p_target;
  INSERT INTO results VALUES (p_case, p_expected, CASE WHEN r LIKE 'rejected%' THEN 'rejected' ELSE r END);
END $f$;

\o /dev/null

-- 회원 A JWT
SELECT pg_temp.try_update('A→본인 폴더 사진', 'allowed', 'authenticated', :'A', :'A', :'OWN_A');
SELECT pg_temp.try_update('A→기본 그림', 'allowed', 'authenticated', :'A', :'A', '/samarket-default-avatar.svg');
SELECT pg_temp.try_update('A→빈 값', 'allowed', 'authenticated', :'A', :'A', NULL);
SELECT pg_temp.try_update('A→B 프로필 사진 주소', 'rejected', 'authenticated', :'A', :'A', :'OWN_B');
SELECT pg_temp.try_update('A→B 게시글 사진 주소', 'rejected', 'authenticated', :'A', :'A', :'POST_B');
SELECT pg_temp.try_update('A→외부 주소', 'rejected', 'authenticated', :'A', :'A', 'https://evil.example.com/x.jpg');
SELECT pg_temp.try_update('A→다른 호스트 같은 경로', 'rejected', 'authenticated', :'A', :'A', replace(:'OWN_A', 'ckdosyydvgzqwpbwuhon', 'attackerproj'));
SELECT pg_temp.try_update('A→본인 경로 + 쿼리', 'rejected', 'authenticated', :'A', :'A', :'OWN_A' || '?x=1');
SELECT pg_temp.try_update('A→본인 경로 + ..', 'rejected', 'authenticated', :'A', :'A', replace(:'OWN_A', '/profile/', '/profile/../posts/'));
SELECT pg_temp.try_update('A→파생본(.thumb.webp)', 'rejected', 'authenticated', :'A', :'A', replace(:'OWN_A', '.jpg', '.thumb.webp'));
SELECT pg_temp.try_update('A→다른 구글 주소(직접 지정)', 'rejected', 'authenticated', :'A', :'A', 'https://lh3.googleusercontent.com/a/other');
-- 값 불변·다른 컬럼만 수정: 기존 구글 사진 보존
SELECT pg_temp.try_update('A 구글 사진 그대로 다시 저장', 'allowed', 'authenticated', :'A', :'A', :'GOOGLE');
SELECT pg_temp.try_update('A 닉네임만 수정(구글 사진 유지)', 'allowed', 'authenticated', :'A', :'A', NULL, true);
-- 서버(service_role)는 검사 대상 아님 — 소셜 사진 저장
SELECT pg_temp.try_update('service_role→구글 사진', 'allowed', 'service_role', NULL, :'A', 'https://lh3.googleusercontent.com/a/new');
SELECT pg_temp.try_update('A 가 B 행 수정(관리자 JWT 가정)→B 본인 사진', 'allowed', 'authenticated', :'A', :'B', :'OWN_B');

-- 회원 JWT INSERT(가입 폴백): 허용 밖 값은 NULL 로 저장(가입은 막지 않음)
SELECT set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
INSERT INTO public.profiles(id, nickname, avatar_url) VALUES ('33333333-3333-4333-8333-333333333333', 'carol', :'OWN_B');
INSERT INTO public.profiles(id, nickname, avatar_url) VALUES ('44444444-4444-4444-8444-444444444444', 'dave', '/samarket-default-avatar.svg');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
INSERT INTO results SELECT 'INSERT 회원 JWT 남의 사진 → NULL', 'null', coalesce(avatar_url, 'null') FROM public.profiles WHERE id = '33333333-3333-4333-8333-333333333333';
INSERT INTO results SELECT 'INSERT 회원 JWT 기본 그림 → 유지', '/samarket-default-avatar.svg', coalesce(avatar_url, 'null') FROM public.profiles WHERE id = '44444444-4444-4444-8444-444444444444';
INSERT INTO results SELECT '시드 B 사진 보존', 'true', (avatar_url = :'OWN_B')::text FROM public.profiles WHERE id = :'B';
INSERT INTO results SELECT '시드 A 구글 사진 보존', 'true', (avatar_url = :'GOOGLE')::text FROM public.profiles WHERE id = :'A';
\o

-- 순수 함수 표본 (운영 적용 후 읽기 전용 SELECT 로도 같은 결과를 확인할 수 있음)
INSERT INTO results VALUES
  ('fn 본인', 'true', public.is_allowed_member_avatar_url(:'A', :'OWN_A')::text),
  ('fn 남의', 'false', public.is_allowed_member_avatar_url(:'A', :'OWN_B')::text),
  ('fn 대문자 uid 경로', 'false', public.is_allowed_member_avatar_url(:'A', upper(:'OWN_A'))::text);

SELECT case_name, expected, actual, CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END AS verdict FROM results;
SELECT (count(*) FILTER (WHERE expected <> actual) > 0) AS has_failure FROM results \gset
\if :has_failure
  \echo 'RESULT: FAIL'
  SELECT 1/0;
\else
  \echo 'RESULT: PASS'
\endif
SQL
