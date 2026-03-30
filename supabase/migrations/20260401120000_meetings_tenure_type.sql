-- 모임: 단기(일정·장소 있음) / 장기(일정·장소 없음)
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS tenure_type text NOT NULL DEFAULT 'short';

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_tenure_type_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_tenure_type_check
  CHECK (tenure_type IN ('short', 'long'));

COMMENT ON COLUMN public.meetings.tenure_type IS 'short=단기 모임(일시·장소), long=장기 모임(일정 비고정)';
