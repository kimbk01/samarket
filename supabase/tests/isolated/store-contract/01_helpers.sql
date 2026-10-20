-- Isolated test helpers (store-contract). Loaded right after 00_fixture.sql. See 00_fixture.sql header for the runner.

-- Run p_sql as p_role (with JWT sub p_sub) and require it to FAIL with SQLSTATE 42501. Returns the error message.
CREATE OR REPLACE FUNCTION public.iso_expect_denied(p_label text, p_role text, p_sub text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, true);
    PERFORM set_config('role', p_role, true);
    EXECUTE p_sql;
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'iso_unexpected_success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_msg = 'iso_unexpected_success' THEN
    RAISE EXCEPTION 'FAIL [%]: % as % succeeded but must be denied', p_label, p_sql, p_role;
  END IF;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL [%]: expected 42501, got % (%)', p_label, v_state, v_msg;
  END IF;
  RAISE NOTICE 'PASS [%] denied: %', p_label, v_msg;
  RETURN v_msg;
END;
$fn$;

-- Run p_sql as p_role and require success; returns ROW_COUNT of the statement.
CREATE OR REPLACE FUNCTION public.iso_expect_ok(p_label text, p_role text, p_sub text, p_sql text)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE
  v_rows bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE p_sql;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  RAISE NOTICE 'PASS [%] ok rows=%', p_label, v_rows;
  RETURN v_rows;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'FAIL [%]: % as % raised % %', p_label, p_sql, p_role, SQLSTATE, SQLERRM;
END;
$fn$;
