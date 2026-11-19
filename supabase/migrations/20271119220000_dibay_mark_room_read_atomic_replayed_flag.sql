-- 읽음 1단계 보완 (docs/audit/supabase-request-surge-2026-11-18/read-mark-legacy-design-2026-11-19.md · Owner 「보완 진행」 2026-11-19)
-- dibay_mark_room_read_atomic: 같은 idempotency key 재요청(같은 방·같은 끝 메시지)은 첫 결과를 그대로 돌려줬다(RETURN v_prev).
-- 재생임을 알 수 없어 서버가 사본 재생성·무효화를 다시 했다(운영 실기 11-19 06:03:38 UTC).
-- 변경: 재생 결과에 "replayed": true 를 덧붙인다. 그 밖의 본문·인자·권한은 운영 현재 정의 그대로(그 자리에서 1줄만 치환).
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.dibay_mark_room_read_atomic(uuid,uuid,text,text,text,uuid,uuid,uuid,text)'::regprocedure
  ) into v_def;
  if (length(v_def) - length(replace(v_def, 'RETURN v_prev;', ''))) / length('RETURN v_prev;') <> 1 then
    raise exception 'dibay_mark_room_read_atomic: expected exactly one "RETURN v_prev;"';
  end if;
  v_new := replace(v_def, 'RETURN v_prev;', 'RETURN v_prev || jsonb_build_object(''replayed'', true);');
  execute v_new;
end;
$$;
