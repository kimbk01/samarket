"use client";

/**
 * 나의 카마켓 메인 한 번에 로드
 * - profile, banner(닫기 여부 반영), services, sections
 * - Supabase: my_page_banners, my_services, my_page_sections
 */
import type { MyPageData, MyPageBannerRow, MyServiceRow, MyPageSectionRow } from "./types";
import { DEFAULT_MY_SECTIONS, DEFAULT_MY_SERVICES } from "./my-page-defaults";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { fetchMeHasOwnerStores } from "@/lib/my/fetch-me-has-owner-stores";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { getMySettings } from "./getMySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import { MY_PAGE_BANNERS_SELECT, MY_PAGE_SECTIONS_SELECT, MY_SERVICES_SELECT } from "@/lib/my/mypage-tables-select";

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
  let services: MyServiceRow[] = DEFAULT_MY_SERVICES;
  let sections: MyPageSectionRow[] = DEFAULT_MY_SECTIONS;

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (!bannerHidden) {
        const [bannerRes, servicesRes, sectionsRes] = await Promise.all([
          supabase
            .from("my_page_banners")
            .select(MY_PAGE_BANNERS_SELECT)
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("my_services")
            .select(MY_SERVICES_SELECT)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("my_page_sections")
            .select(MY_PAGE_SECTIONS_SELECT)
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
            .select(MY_SERVICES_SELECT)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("my_page_sections")
            .select(MY_PAGE_SECTIONS_SELECT)
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
  const isBusinessMember = hasOwnerStore;
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
