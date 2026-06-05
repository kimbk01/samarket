BEGIN;

CREATE TABLE IF NOT EXISTS public.my_page_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NULL,
  image_url text NULL,
  link_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  dismissible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.my_services (
  code text PRIMARY KEY,
  label text NOT NULL,
  icon_key text NOT NULL DEFAULT 'box',
  href text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  admin_only boolean NOT NULL DEFAULT false,
  country_code text NULL
);

CREATE TABLE IF NOT EXISTS public.my_page_sections (
  section_key text PRIMARY KEY,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_my_page_banners_active_sort
  ON public.my_page_banners (is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_my_services_active_sort
  ON public.my_services (is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_my_page_sections_active_sort
  ON public.my_page_sections (is_active, sort_order);

ALTER TABLE public.my_page_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_page_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS my_page_banners_select ON public.my_page_banners;
CREATE POLICY my_page_banners_select
  ON public.my_page_banners
  FOR SELECT
  USING (is_active = true OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS my_page_banners_admin_write ON public.my_page_banners;
CREATE POLICY my_page_banners_admin_write
  ON public.my_page_banners
  FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS my_services_select ON public.my_services;
CREATE POLICY my_services_select
  ON public.my_services
  FOR SELECT
  USING (is_active = true OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS my_services_admin_write ON public.my_services;
CREATE POLICY my_services_admin_write
  ON public.my_services
  FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS my_page_sections_select ON public.my_page_sections;
CREATE POLICY my_page_sections_select
  ON public.my_page_sections
  FOR SELECT
  USING (is_active = true OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS my_page_sections_admin_write ON public.my_page_sections;
CREATE POLICY my_page_sections_admin_write
  ON public.my_page_sections
  FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

GRANT SELECT ON public.my_page_banners TO authenticated;
GRANT SELECT ON public.my_services TO authenticated;
GRANT SELECT ON public.my_page_sections TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.my_page_banners TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.my_services TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.my_page_sections TO authenticated;

INSERT INTO public.my_services (code, label, icon_key, href, is_active, sort_order, admin_only, country_code)
VALUES
  ('products', '내상품', 'box', '/mypage/products', true, 0, false, null),
  ('business', '내 상점', 'store', '/stores/owner', true, 1, false, null),
  ('ads', '광고 신청', 'megaphone', '/mypage/ads', true, 2, false, null),
  ('points', '포인트', 'coin', '/mypage/points', true, 3, false, null),
  ('benefits', '회원 혜택', 'gift', '/my/benefits', true, 4, false, null),
  ('reviews', '받은 후기', 'star', '/mypage/trade/reviews', true, 5, false, null),
  ('regions', '동네 설정', 'map', '/mypage/addresses', true, 6, false, null),
  ('blocked', '차단 목록', 'block', '/mypage/settings/hidden-users', true, 7, false, null)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.my_page_sections (section_key, title, is_active, sort_order)
VALUES
  ('trade', '거래', true, 0),
  ('board', '게시판', true, 1),
  ('store', '매장·주문', true, 2),
  ('account', '개인 설정', true, 3)
ON CONFLICT (section_key) DO NOTHING;

COMMIT;
