-- CREW REP S5 거래 평가 — Owner 2026-11-16 「거래 평가 살리기」·「S5 진행해」 (설계 §7.6)
-- 1) 평가 상태·공개·거래 확인·이의제기 열 추가 (기존 30행은 revealed 로 둔다 — 구매 확정 흐름 기록, 설계 §7.7)
-- 2) 방·평가자당 1회
-- 3) D14·D15: 앱 사용자 직접 INSERT·전체 SELECT 정책 삭제 → service role(서버)만. 읽는 서버 경로는 모두 service role.

ALTER TABLE public.transaction_reviews
  ADD COLUMN IF NOT EXISTS rating_status text NOT NULL DEFAULT 'revealed',
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS trade_happened text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_note text,
  ADD COLUMN IF NOT EXISTS dispute_decision text,
  ADD COLUMN IF NOT EXISTS dispute_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_decided_by uuid,
  ADD COLUMN IF NOT EXISTS admin_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_reviews_rating_status_check') THEN
    ALTER TABLE public.transaction_reviews ADD CONSTRAINT transaction_reviews_rating_status_check
      CHECK (rating_status IN ('pending_reveal', 'revealed', 'disputed', 'reversed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_reviews_trade_happened_check') THEN
    ALTER TABLE public.transaction_reviews ADD CONSTRAINT transaction_reviews_trade_happened_check
      CHECK (trade_happened IS NULL OR trade_happened IN ('yes', 'chat_only'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_reviews_dispute_decision_check') THEN
    ALTER TABLE public.transaction_reviews ADD CONSTRAINT transaction_reviews_dispute_decision_check
      CHECK (dispute_decision IS NULL OR dispute_decision IN ('accepted', 'rejected'));
  END IF;
END $$;

UPDATE public.transaction_reviews SET revealed_at = created_at WHERE revealed_at IS NULL AND rating_status = 'revealed';

CREATE UNIQUE INDEX IF NOT EXISTS transaction_reviews_room_reviewer_uidx
  ON public.transaction_reviews (room_id, reviewer_id);

CREATE INDEX IF NOT EXISTS transaction_reviews_status_created_idx
  ON public.transaction_reviews (rating_status, created_at);

COMMENT ON COLUMN public.transaction_reviews.rating_status IS
  'CREW REP 거래 평가 상태: pending_reveal(상대 대기·비공개) → revealed → disputed(이의 검토) → reversed(인정·점수 0)';
COMMENT ON COLUMN public.transaction_reviews.review_comment IS
  '남길 말 — 운영자만 본다 (S5부터 공개 화면에 내보내지 않음)';

DROP POLICY IF EXISTS transaction_reviews_insert ON public.transaction_reviews;
DROP POLICY IF EXISTS transaction_reviews_select ON public.transaction_reviews;
ALTER TABLE public.transaction_reviews ENABLE ROW LEVEL SECURITY;

-- 4) 어드민 검색 뷰에 평가 상태·이의제기 열 추가 (끝에만 더한다)
CREATE OR REPLACE VIEW public.admin_transaction_reviews_search_v AS
 SELECT tr.id,
    tr.product_id,
    tr.room_id,
    tr.reviewer_id,
    tr.reviewee_id,
    tr.role_type,
    tr.public_review_type,
    tr.private_manner_score,
    tr.private_tags,
    tr.is_anonymous_negative,
    tr.created_at,
    tr.positive_tag_keys,
    tr.negative_tag_keys,
    tr.review_comment,
    p.title AS post_title,
    rv.nickname AS reviewer_nickname,
    rv.display_name AS reviewer_display_name,
    rv.username AS reviewer_username,
    re.nickname AS reviewee_nickname,
    re.display_name AS reviewee_display_name,
    re.username AS reviewee_username,
    (tr.room_id)::text AS room_id_text,
    tr.rating_status,
    tr.trade_happened,
    tr.disputed_at,
    tr.dispute_reason,
    tr.dispute_note,
    tr.dispute_decision
   FROM transaction_reviews tr
     LEFT JOIN posts p ON p.id = tr.product_id
     LEFT JOIN profiles rv ON rv.id = tr.reviewer_id
     LEFT JOIN profiles re ON re.id = tr.reviewee_id;
