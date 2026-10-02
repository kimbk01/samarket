-- WP-8 / NEW-08 (Owner LOCK 04) — 통화기록 "나만 삭제"(DELETE_FOR_ME).
--
-- FIRST DIVERGENCE: deleteCommunityMessengerCallLog 가 세션당 1행인 공유 call_log 를 hard
-- delete → 한 쪽이 지우면 상대 기록까지 사라진다(과거 380건 유실). 컬럼식 숨김은 상대에게
-- 삭제 사실이 노출되므로 쓰지 않고, 사용자별 숨김 테이블을 둔다.
--
-- 계약: 이 테이블은 "한 사용자의 목록에서 숨김"만 담당한다. 원본 call_log·상대 가시성은
-- 물리 삭제하지 않는다. 물리 삭제는 WP-13 retention authority 만 수행한다.

CREATE TABLE IF NOT EXISTS public.community_messenger_call_log_user_hides (
  user_id uuid NOT NULL,
  call_log_id uuid NOT NULL
    REFERENCES public.community_messenger_call_logs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, call_log_id)
);

CREATE INDEX IF NOT EXISTS cm_call_log_user_hides_user_idx
  ON public.community_messenger_call_log_user_hides (user_id);

ALTER TABLE public.community_messenger_call_log_user_hides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_call_log_user_hides_own ON public.community_messenger_call_log_user_hides;
CREATE POLICY cm_call_log_user_hides_own ON public.community_messenger_call_log_user_hides
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.community_messenger_call_log_user_hides IS
  'WP-8 NEW-08 (LOCK-04) DELETE_FOR_ME: per-user hide of a shared call_log. Never physical-deletes the shared row or the peer''s visibility. Physical delete = WP-13 retention only.';
