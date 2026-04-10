-- 거래 글 상태 변경 감사 로그 (선택 적용 — 앱은 테이블 없어도 동작)
CREATE TABLE IF NOT EXISTS post_trade_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  user_id uuid NOT NULL,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_trade_status_logs_post_id_idx ON post_trade_status_logs (post_id);
CREATE INDEX IF NOT EXISTS post_trade_status_logs_created_at_idx ON post_trade_status_logs (created_at DESC);
