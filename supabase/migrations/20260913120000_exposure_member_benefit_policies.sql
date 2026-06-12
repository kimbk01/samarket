-- 노출 점수 정책 · 회원 혜택 정책 (어드민 mock → DB)

BEGIN;

CREATE TABLE IF NOT EXISTS public.exposure_score_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL CHECK (surface IN ('home', 'search', 'shop_featured')),
  is_active boolean NOT NULL DEFAULT true,
  policy_name text NOT NULL DEFAULT '',
  latest_weight numeric NOT NULL DEFAULT 1,
  popular_weight numeric NOT NULL DEFAULT 0.8,
  nearby_weight numeric NOT NULL DEFAULT 0.6,
  premium_boost_weight numeric NOT NULL DEFAULT 0,
  business_boost_weight numeric NOT NULL DEFAULT 0,
  ad_boost_weight numeric NOT NULL DEFAULT 0,
  point_promotion_boost_weight numeric NOT NULL DEFAULT 0,
  bump_boost_weight numeric NOT NULL DEFAULT 0,
  exact_region_match_weight numeric NOT NULL DEFAULT 0,
  same_city_weight numeric NOT NULL DEFAULT 0,
  same_barangay_weight numeric NOT NULL DEFAULT 0,
  admin_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exposure_score_policies_surface_active
  ON public.exposure_score_policies (surface, is_active);

CREATE TABLE IF NOT EXISTS public.exposure_policy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.exposure_score_policies(id) ON DELETE CASCADE,
  surface text NOT NULL,
  action_type text NOT NULL,
  admin_id uuid REFERENCES auth.users(id),
  admin_nickname text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exposure_policy_logs_created
  ON public.exposure_policy_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.member_benefit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_type text NOT NULL CHECK (member_type IN ('normal', 'premium', 'admin')),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  profile_frame_type text NOT NULL DEFAULT 'dark'
    CHECK (profile_frame_type IN ('dark', 'gold', 'admin_special')),
  badge_label text NOT NULL DEFAULT '',
  home_priority_boost integer NOT NULL DEFAULT 0,
  search_priority_boost integer NOT NULL DEFAULT 0,
  shop_featured_priority_boost integer NOT NULL DEFAULT 0,
  point_reward_bonus_rate numeric NOT NULL DEFAULT 0,
  ad_discount_rate numeric NOT NULL DEFAULT 0,
  product_limit_per_month integer,
  can_open_business_profile boolean NOT NULL DEFAULT true,
  can_access_premium_promotion boolean NOT NULL DEFAULT false,
  admin_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_benefit_policies_type_active
  ON public.member_benefit_policies (member_type, is_active);

CREATE TABLE IF NOT EXISTS public.member_benefit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  user_nickname text NOT NULL DEFAULT '',
  member_type text NOT NULL,
  policy_id uuid REFERENCES public.member_benefit_policies(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'admin',
  actor_id uuid REFERENCES auth.users(id),
  actor_nickname text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_benefit_logs_policy_created
  ON public.member_benefit_logs (policy_id, created_at DESC);

ALTER TABLE public.exposure_score_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exposure_policy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_benefit_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_benefit_logs ENABLE ROW LEVEL SECURITY;

-- 시드 (기존 mock 기본값)
INSERT INTO public.exposure_score_policies (
  id, surface, is_active, policy_name,
  latest_weight, popular_weight, nearby_weight,
  premium_boost_weight, business_boost_weight, ad_boost_weight,
  point_promotion_boost_weight, bump_boost_weight,
  exact_region_match_weight, same_city_weight, same_barangay_weight,
  admin_memo
) VALUES
  (
    'a1000001-0000-4000-8000-000000000001', 'home', true, '홈 상단 정책',
    1, 0.8, 0.6, 10, 5, 20, 15, 8, 12, 6, 10, '홈 피드 노출'
  ),
  (
    'a1000002-0000-4000-8000-000000000002', 'search', true, '검색 결과 정책',
    1, 0.9, 0.5, 8, 4, 18, 12, 6, 10, 5, 8, '검색 상단 노출'
  ),
  (
    'a1000003-0000-4000-8000-000000000003', 'shop_featured', true, '상점 featured 정책',
    0.8, 0.7, 0.3, 5, 15, 10, 10, 5, 6, 3, 5, '상점 추천 영역'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.member_benefit_policies (
  id, member_type, title, description, is_active,
  profile_frame_type, badge_label,
  home_priority_boost, search_priority_boost, shop_featured_priority_boost,
  point_reward_bonus_rate, ad_discount_rate,
  can_open_business_profile, can_access_premium_promotion, admin_memo
) VALUES
  (
    'b1000001-0000-4000-8000-000000000001', 'normal', '일반 회원 기본', '기본 노출·등록 제한 적용', true,
    'dark', '', 0, 0, 0, 0, 0, true, false, '기본 정책'
  ),
  (
    'b1000002-0000-4000-8000-000000000002', 'premium', '특별 회원 혜택', '노출 우선·광고 할인·포인트 보너스', true,
    'gold', '특별회원', 10, 5, 8, 0.1, 0.15, true, true, '홈/검색/상점 우선 노출'
  ),
  (
    'b1000003-0000-4000-8000-000000000003', 'admin', '관리자 전용', '관리자 배지·전용 액자', true,
    'admin_special', '관리자', 0, 0, 0, 0, 0, true, true, '시각 구분용'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
