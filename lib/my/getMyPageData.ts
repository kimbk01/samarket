"use client";

/**
 * 나의 카마켓 메인 한 번에 로드
 * - profile, banner(닫기 여부 반영), services, sections
 * - Supabase: my_page_banners, my_services, my_page_sections
 */
import type { MyPageData, MyPageBannerRow, MyServiceRow, MyPageSectionRow } from "./types";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { fetchMeHasOwnerStores } from "@/lib/my/fetch-me-has-owner-stores";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { getBusinessProfileByOwnerUserId } from "@/lib/business/mock-business-profiles";
import { getMySettings } from "./getMySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";

const DEFAULT_SERVICES: MyServiceRow[] = [
  { code: "products", label: "내상품", icon_key: "box", href: "/my/products", is_active: true, sort_order: 0, admin_only: false, country_code: null },
  { code: "business", label: "내 상점", icon_key: "store", href: "/my/business", is_active: true, sort_order: 1, admin_only: false, country_code: null },
  { code: "ads", label: "광고 신청", icon_key: "megaphone", href: "/my/ads", is_active: true, sort_order: 2, admin_only: false, country_code: null },
  { code: "points", label: "포인트", icon_key: "coin", href: "/my/points", is_active: true, sort_order: 3, admin_only: false, country_code: null },
  { code: "benefits", label: "회원 혜택", icon_key: "gift", href: "/my/benefits", is_active: true, sort_order: 4, admin_only: false, country_code: null },
  { code: "reviews", label: "받은 후기", icon_key: "star", href: "/my/reviews", is_active: true, sort_order: 5, admin_only: false, country_code: null },
  { code: "regions", label: "동네 설정", icon_key: "map", href: "/my/regions", is_active: true, sort_order: 6, admin_only: false, country_code: null },
  { code: "blocked", label: "차단 목록", icon_key: "block", href: "/my/settings/blocked-users", is_active: true, sort_order: 7, admin_only: false, country_code: null },
];

const DEFAULT_SECTIONS: MyPageSectionRow[] = [
  { section_key: "deals", title: "나의 거래", is_active: true, sort_order: 0 },
  { section_key: "interests", title: "나의 관심", is_active: true, sort_order: 1 },
  { section_key: "activity", title: "나의 활동", is_active: true, sort_order: 2 },
  { section_key: "business", title: "나의 비즈니스", is_active: true, sort_order: 3 },
];

export async function getMyPageData(): Promise<MyPageData> {
  const user = getCurrentUser();
  const userId = user?.id ?? null;
  const settings = userId ? getMySettings(userId) : {};
  const bannerHidden = settings.app_banner_hidden === true;

  const [profile, hasOwnerStore] = await Promise.all([
    getMyProfile(),
    fetchMeHasOwnerStores(),
  ]);

  let banner: MyPageBannerRow | null = null;
  let services = DEFAULT_SERVICES;
  let sections = DEFAULT_SECTIONS;

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (!bannerHidden) {
        const [bannerRes, servicesRes, sectionsRes] = await Promise.all([
          supabase
            .from("my_page_banners")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("my_services")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("my_page_sections")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
        ]);
        if (bannerRes.data) banner = bannerRes.data as MyPageBannerRow;
        if (servicesRes.data?.length) services = servicesRes.data as MyServiceRow[];
        if (sectionsRes.data?.length) sections = sectionsRes.data as MyPageSectionRow[];
      } else {
        const [servicesRes, sectionsRes] = await Promise.all([
          supabase
            .from("my_services")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("my_page_sections")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
        ]);
        if (servicesRes.data?.length) services = servicesRes.data as MyServiceRow[];
        if (sectionsRes.data?.length) sections = sectionsRes.data as MyPageSectionRow[];
      }
    } catch {
      // keep defaults
    }
  }

  const uid = profile?.id ?? userId ?? "";
  const trustSummary = uid ? getTrustSummary(uid) : null;
  const mannerScore = profile
    ? resolveProfileTrustScore(profile as unknown as Record<string, unknown>)
    : (trustSummary?.mannerScore ?? 50);
  const businessProfile = uid ? getBusinessProfileByOwnerUserId(uid) : null;
  const isBusinessMember = businessProfile?.status === "active";
  const isAdmin = isAdminUser(user);

  return {
    profile,
    banner,
    bannerHidden,
    services: services.filter((s) => !s.admin_only || isAdmin),
    sections,
    mannerScore,
    isBusinessMember,
    isAdmin,
    hasOwnerStore,
  };
}
