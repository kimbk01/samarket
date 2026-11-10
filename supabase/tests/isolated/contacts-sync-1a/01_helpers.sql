-- 시험 도우미 (10_contacts.test.sql 앞부분과 같은 정의) — 10 을 돌리지 않는 DB(iso_contacts_rj)에서 50·60 이 쓴다
CREATE OR REPLACE FUNCTION t_ok(p_id text, p_cond boolean, p_detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF coalesce(p_cond, false) THEN RAISE NOTICE 'PASS %', p_id; ELSE RAISE EXCEPTION 'FAIL % %', p_id, p_detail; END IF;
END $$;
CREATE OR REPLACE FUNCTION t_h(p text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT sha256(convert_to(p, 'UTF8')) $$;
CREATE OR REPLACE FUNCTION t_hex(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
CREATE OR REPLACE FUNCTION t_members(p_list jsonb) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg((m->>'user_id')::uuid ORDER BY m->>'user_id'), '{}') FROM jsonb_array_elements(p_list->'members') m $$;

