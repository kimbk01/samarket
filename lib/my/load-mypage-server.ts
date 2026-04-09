import { cache } from "react";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getAllowedAdminEmails } from "@/lib/auth/admin-policy";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import type { MyPageData, MyPageBannerRow, MyServiceRow, MyPageSectionRow } from "./types";
import { DEFAULT_MY_SERVICES, DEFAULT_MY_SECTIONS } from "./my-page-defaults";

function isAdminEmailForServer(email: string | null | undefined): boolean {
  const e = email?.trim();
  if (!e) return false;
  return getAllowedAdminEmails().includes(e);
}

/**
 * `/mypage` RSC 선로딩 — 클라 `getMyPageData` 와 동일 정보(배너 숨김은 로컬 설정이라 서버에선 false 로 두고 클라에서 보정).
 */
export const loadMypageServer = cache(async (): Promise<MyPageData | null> => {
  const userId = await getRouteUserId();
  if (!userId) return null;

  const userSb = await createSupabaseRouteHandlerClient();
  const profile = userSb ? await fetchProfileRowSafe(userSb, userId) : null;

  let hasOwnerStore = false;
  const sbStores = tryGetSupabaseForStores();
  if (sbStores) {
    const { data: oneStore } = await sbStores.from("stores").select("id").eq("owner_user_id", userId).limit(1);
    hasOwnerStore = Array.isArray(oneStore) && oneStore.length > 0;
  }

  let banner: MyPageBannerRow | null = null;
  let services: MyServiceRow[] = DEFAULT_MY_SERVICES;
  let sections: MyPageSectionRow[] = DEFAULT_MY_SECTIONS;

  if (userSb) {
    try {
      const [bannerRes, servicesRes, sectionsRes] = await Promise.all([
        userSb
          .from("my_page_banners")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle(),
        userSb.from("my_services").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        userSb
          .from("my_page_sections")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (bannerRes.data) banner = bannerRes.data as MyPageBannerRow;
      if (servicesRes.data?.length) services = servicesRes.data as MyServiceRow[];
      if (sectionsRes.data?.length) sections = sectionsRes.data as MyPageSectionRow[];
    } catch {
      /* defaults */
    }
  }

  const uid = profile?.id ?? userId;
  const trustSummary = uid ? getTrustSummary(uid) : null;
  const mannerScore = profile
    ? resolveProfileTrustScore(profile as unknown as Record<string, unknown>)
    : (trustSummary?.mannerScore ?? 50);
  const isBusinessMember = hasOwnerStore;
  const isAdmin = isAdminEmailForServer(profile?.email ?? null);

  return {
    profile,
    banner,
    bannerHidden: false,
    services: services.filter((s) => !s.admin_only || isAdmin),
    sections,
    mannerScore,
    isBusinessMember,
    isAdmin,
    hasOwnerStore,
  };
});
