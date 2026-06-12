-- 어드민 배너 (my_page_banners 확장 — mock 제거용)

BEGIN;

ALTER TABLE public.my_page_banners
  ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'home_top',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS mobile_image_url text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impression_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_memo text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.admin_banner_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES public.my_page_banners(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  admin_id uuid REFERENCES auth.users(id),
  admin_nickname text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_banner_change_logs_banner
  ON public.admin_banner_change_logs (banner_id, created_at DESC);

COMMIT;
