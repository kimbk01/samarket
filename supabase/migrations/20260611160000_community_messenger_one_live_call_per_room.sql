-- 한 채팅방(room)에는 ringing 또는 active 인 통화가 동시에 하나만 존재하도록 제약.
-- 동시에 두 번 발신(이중 탭·연타)해도 DB가 하나만 허용하고, 앱은 기존 세션을 반환한다.

UPDATE public.community_messenger_call_sessions AS s
SET
  status = 'ended',
  ended_at = COALESCE(s.ended_at, now()),
  updated_at = now()
WHERE s.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY room_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.community_messenger_call_sessions
    WHERE status IN ('ringing', 'active')
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_call_sessions_one_live_per_room
  ON public.community_messenger_call_sessions (room_id)
  WHERE status IN ('ringing', 'active');
