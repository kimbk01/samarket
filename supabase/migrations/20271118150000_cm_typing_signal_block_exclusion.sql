-- P3 (2026-11-18, Owner 「권장안대로 반영」): 1:1 차단 관계면 「입력 중」 발신 금지.
--
-- 설계: docs/audit/messenger-chat-audit-2026-11-18/appendix-P3-typing-scroll-presence-design.md B-1 「차단 제외 SQL」
-- - public.cm_can_access_messenger_room 은 바꾸지 않는다(메시지·방 RLS 에 쓰임 — 차단 시 대화 기록이 사라지는 큰 변화).
-- - 토픽 **발신(INSERT)** 권한 internal.cm_realtime_can_send_topic 의 typing 분기만 새 함수로 바꾼다.
--   구독(join, internal.cm_realtime_can_read_topic)은 그대로 → CHANNEL_ERROR 재가입 반복 없음, 구 바이너리 호환
--   (차단 시 REST 발신이 거부되고 클라이언트 경고 로그만 남음). 토픽 이름·페이로드 불변.
-- - 양방향 차단: 내가 막았거나 상대가 나를 막았으면 발신 불가. 그룹은 그대로(차단은 1:1 개념).
-- - 1:1 left_at 조건은 넣지 않는다(운영 의미 확인 전 — Owner 2026-11-18 지시).
-- - 차단 SSOT: public.user_social_relations(owner_user_id, target_user_id, relation_type='blocked', is_active)
--   (운영 컬럼 2026-11-18 확인).
--
-- 작성 방식: 운영 현재 본문(pg_get_functiondef)에서 typing 분기 식 1곳만 바꿔 다시 만든다 — 저장소 사본과
-- 운영 본문 차이가 있어도 다른 분기(거래 typing/presence·cm-call-invite·presence)는 글자 그대로 유지.
-- 바꿀 식이 정확히 1번 나오지 않으면 중단(raise exception)한다.
--
-- 롤백:
--   1) 아래 「롤백 본문」 주석의 typing 분기(public.cm_can_access_messenger_room(...))로 같은 방식 치환 1회
--   2) drop function internal.cm_can_signal_typing_in_room(uuid);
--
-- 적용: Owner 승인 후(운영 DB 함수 변경). 이 PR 은 파일만 — 적용하지 않음.

create or replace function internal.cm_can_signal_typing_in_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.cm_can_access_messenger_room(p_room_id)
    and not exists (
      select 1
      from public.community_messenger_rooms r
      join public.community_messenger_participants peer
        on peer.room_id = r.id
       and peer.user_id <> auth.uid()
      join public.user_social_relations sr
        on sr.relation_type = 'blocked'
       and sr.is_active
       and (
         (sr.owner_user_id = auth.uid() and sr.target_user_id = peer.user_id)
         or (sr.owner_user_id = peer.user_id and sr.target_user_id = auth.uid())
       )
      where r.id = p_room_id
        and r.room_type = 'direct'
    );
$$;

revoke all on function internal.cm_can_signal_typing_in_room(uuid) from public, anon;
grant execute on function internal.cm_can_signal_typing_in_room(uuid) to authenticated;

comment on function internal.cm_can_signal_typing_in_room(uuid) is
  'Realtime typing send authorization: room access and, for direct rooms, no active block in either direction (P3 2026-11-18).';

do $migration$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_pattern constant text :=
    'public\.cm_can_access_messenger_room\(\s*internal\.cm_realtime_topic_suffix_uuid\(\s*p_topic\s*,\s*''community-messenger-typing:''\s*\)\s*\)';
  v_replacement constant text :=
    'internal.cm_can_signal_typing_in_room(internal.cm_realtime_topic_suffix_uuid(p_topic, ''community-messenger-typing:''))';
begin
  v_def := pg_get_functiondef('internal.cm_realtime_can_send_topic(text)'::regprocedure);

  select count(*) into v_hits from regexp_matches(v_def, v_pattern, 'g');
  if v_hits <> 1 then
    raise exception 'P3 typing anchor: expected exactly 1 typing branch in internal.cm_realtime_can_send_topic, found %', v_hits;
  end if;

  v_new := regexp_replace(v_def, v_pattern, v_replacement);
  if v_new = v_def or position('internal.cm_can_signal_typing_in_room(' in v_new) = 0 then
    raise exception 'P3 typing anchor: replacement did not apply';
  end if;

  execute v_new;
end
$migration$;

-- 롤백 본문(typing 분기 원래 식):
--   public.cm_can_access_messenger_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-typing:'))
