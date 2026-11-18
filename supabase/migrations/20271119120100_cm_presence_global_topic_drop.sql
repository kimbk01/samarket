-- D1 2단계 B (삭제 · 새 코드 **배포 후** 적용) — 전역 접속 채널 `community-messenger:presence` 수신 권한 제거.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/d1-presence-push-structure-analysis-2026-11-19.md (E2·E5)
--
-- 이유: 로그인 회원 누구나 전역 채널에 들어가 전체 접속자 id 를 볼 수 있었다(차단·친구 관계 무관) +
--       접속자 N² 전파. 새 클라이언트는 이 채널을 쓰지 않는다(사용자별 토픽 `cm-presence-user:%` 로 대체).
-- 순서: 배포 전에 적용하면 아직 이 채널을 쓰는 클라이언트가 HTTP 폴백 폴링으로 넘어간다 → 반드시 배포 확인 뒤.
-- 운영 현재 정의에서 절 1개(2줄)만 지운다. 정확히 1번이 아니면 중단.

do $$
declare
  v_def text;
  v_new text;
  v_clause constant text :=
    E'      when p_topic = ''community-messenger:presence'' then\n'
    || E'        auth.uid() is not null\n';
begin
  v_def := pg_get_functiondef('internal.cm_realtime_can_read_topic(text)'::regprocedure);
  if position(v_clause in v_def) = 0 then
    return; -- 이미 제거됨
  end if;
  if (length(v_def) - length(replace(v_def, v_clause, ''))) / length(v_clause) <> 1 then
    raise exception 'cm_realtime_can_read_topic: global presence clause not found exactly once — stop';
  end if;
  v_new := replace(v_def, v_clause, '');
  execute v_new;
end;
$$;
