-- 발신 시도(attempt) 식별자 계약 (android-caller-stuck-after-remote-missed-design §15-4 · Owner 설계 승인 2026-11-01).
-- 발신 시도 ID 가 웹 메모리에만 있어, 「서버 생성 → 클라이언트가 ID 받음」 사이가 끊기면 그 통화를 아무도 가리켜
-- 취소할 수 없었다. 시도 ID 를 서버 통화의 정식 식별자로 저장하고, 생성 전에 그만둔 시도는 취소 기록으로 남긴다.
-- 구 클라이언트(시도 ID 미전송)는 client_attempt_id = NULL 로 지금과 똑같이 동작한다.

ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS client_attempt_id uuid NULL;

-- 같은 발신자의 같은 시도는 통화 1개 (재시도 멱등 · 시도 취소 대상 단일화).
CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_call_sessions_initiator_attempt_uniq
  ON public.community_messenger_call_sessions (initiator_user_id, client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;

-- 시도 취소 기록 — 취소가 생성보다 먼저 와도 이후 생성이 통화를 만들지 않게 한다.
-- 서버(service role)만 읽고 쓴다(RLS 켜고 정책 없음 = 회원 접근 불가).
CREATE TABLE IF NOT EXISTS public.community_messenger_call_attempt_cancellations (
  initiator_user_id uuid NOT NULL,
  client_attempt_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (initiator_user_id, client_attempt_id)
);

ALTER TABLE public.community_messenger_call_attempt_cancellations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_messenger_call_attempt_cancellations FROM anon, authenticated;
