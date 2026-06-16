-- 발신자·수신자 각각 direct ringing/active 세션이 동시에 하나만 존재하도록 제약.
-- room당 1개(20260611160000)와 병행 — caller 연타·다중 방 발신 시에도 live 세션 단일화.

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
        PARTITION BY initiator_user_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.community_messenger_call_sessions
    WHERE session_mode = 'direct'
      AND status IN ('ringing', 'active')
  ) ranked
  WHERE ranked.rn > 1
);

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
        PARTITION BY recipient_user_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.community_messenger_call_sessions
    WHERE session_mode = 'direct'
      AND recipient_user_id IS NOT NULL
      AND status IN ('ringing', 'active')
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_call_sessions_one_live_per_initiator
  ON public.community_messenger_call_sessions (initiator_user_id)
  WHERE session_mode = 'direct' AND status IN ('ringing', 'active');

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_call_sessions_one_live_per_recipient
  ON public.community_messenger_call_sessions (recipient_user_id)
  WHERE session_mode = 'direct'
    AND recipient_user_id IS NOT NULL
    AND status IN ('ringing', 'active');
