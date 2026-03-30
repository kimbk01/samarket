-- 당근형 동네 커뮤니티: 샘플 데이터 일괄 식별·추후 삭제용 플래그
-- (거래/채팅 코어 스키마 변경 없음)

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS community_posts_is_sample_data_idx
  ON public.community_posts (is_sample_data)
  WHERE is_sample_data = true;

CREATE INDEX IF NOT EXISTS meetings_is_sample_data_idx
  ON public.meetings (is_sample_data)
  WHERE is_sample_data = true;
