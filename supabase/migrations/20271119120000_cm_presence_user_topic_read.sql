-- D1 2단계 A (추가 · 코드 병합 **전** 적용) — 사용자별 접속 상태 비공개 토픽 `cm-presence-user:<userId>` 수신 권한.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/d1-presence-push-structure-analysis-2026-11-19.md
--
-- 수신 허용: 본인, 또는 그 사용자와 같은 방에 함께 있는(둘 다 left_at is null) 참가자.
-- 발행: 서버(서비스 롤 REST broadcast)만 — cm_realtime_can_send_topic 은 바꾸지 않는다.
-- 기존 토픽 절은 그대로 둔다(전역 `community-messenger:presence` 제거는 B 마이그레이션, 코드 배포 후).
-- 운영 현재 정의(pg_get_functiondef)를 읽어 고정 문구 1곳 앞에만 절을 끼운다. 고정 문구가 정확히 1번이 아니면 중단.

do $$
declare
  v_def text;
  v_new text;
  v_anchor constant text := E'      when p_topic = ''community-messenger:presence'' then\n';
begin
  v_def := pg_get_functiondef('internal.cm_realtime_can_read_topic(text)'::regprocedure);
  if position('''cm-presence-user:%''' in v_def) > 0 then
    return; -- 이미 있음
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'cm_realtime_can_read_topic: presence anchor not found exactly once — stop';
  end if;
  v_new := replace(v_def, v_anchor,
    E'      -- D1 2단계: 사용자별 접속 상태 — 본인 또는 같은 방 참가자만\n'
    || E'      when p_topic like ''cm-presence-user:%'' then\n'
    || E'        internal.cm_realtime_topic_suffix_uuid(p_topic, ''cm-presence-user:'') = auth.uid()\n'
    || E'        or exists (\n'
    || E'          select 1\n'
    || E'          from public.community_messenger_participants me\n'
    || E'          join public.community_messenger_participants peer on peer.room_id = me.room_id\n'
    || E'          where me.user_id = auth.uid()\n'
    || E'            and me.left_at is null\n'
    || E'            and peer.user_id = internal.cm_realtime_topic_suffix_uuid(p_topic, ''cm-presence-user:'')\n'
    || E'            and peer.left_at is null\n'
    || E'        )\n'
    || v_anchor);
  execute v_new;
end;
$$;
