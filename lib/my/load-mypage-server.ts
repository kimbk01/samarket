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
import { MY_PAGE_BANNERS_SELECT, MY_PAGE_SECTIONS_SELECT, MY_SERVICES_SELECT } from "@/lib/my/mypage-tables-select";
import { loadMypageHubExtrasServer } from "@/lib/my/load-mypage-hub-extras-server";
import { loadMypageHomeDashboardCountsServer } from "@/lib/my/load-mypage-home-dashboard-counts-server";

function isAdminEmailForServer(email: string | null | undefined): boolean {
  const e = email?.trim();
  if (!e) return false;
  return getAllowedAdminEmails().includes(e);
}

/** 프로필·CMS·매장 보유 + `loadMypageHubExtrasServer` 용 라우트 user id */
type MypageCoreInternal = Omit<MyPageData, "hubServerExtras" | "homeDashboardCounts"> & { viewerIdForHub: string };

const loadMypageCoreCached = cache(async (): Promise<MypageCoreInternal | null> => {
  const userId = await getRouteUserId();
  if (!userId) return null;

  const userSb = await createSupabaseRouteHandlerClient();
  const sbStores = tryGetSupabaseForStores();

  const profilePromise = userSb ? fetchProfileRowSafe(userSb, userId) : Promise.resolve(null);

  const storesHeadPromise =
    sbStores != null
      ? sbStores.from("stores").select("id").eq("owner_user_id", userId).limit(1)
      : Promise.resolve({ data: null as unknown });

  const loadCmsPack = async (): Promise<[MyPageBannerRow | null, MyServiceRow[], MyPageSectionRow[]]> => {
    if (!userSb) return [null, DEFAULT_MY_SERVICES, DEFAULT_MY_SECTIONS];
    try {
      const [bannerRes, servicesRes, sectionsRes] = await Promise.all([
        userSb
          .from("my_page_banners")
          .select(MY_PAGE_BANNERS_SELECT)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle(),
        userSb
          .from("my_services")
          .select(MY_SERVICES_SELECT)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        userSb
          .from("my_page_sections")
          .select(MY_PAGE_SECTIONS_SELECT)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      let banner: MyPageBannerRow | null = null;
      let services: MyServiceRow[] = DEFAULT_MY_SERVICES;
      let sections: MyPageSectionRow[] = DEFAULT_MY_SECTIONS;
      if (bannerRes.data) banner = bannerRes.data as MyPageBannerRow;
      if (servicesRes.data?.length) services = servicesRes.data as MyServiceRow[];
      if (sectionsRes.data?.length) sections = sectionsRes.data as MyPageSectionRow[];
      return [banner, services, sections];
    } catch {
      return [null, DEFAULT_MY_SERVICES, DEFAULT_MY_SECTIONS];
    }
  };

  const cmsPackPromise = loadCmsPack();

  const [profile, storesHead, cmsPack] = await Promise.all([profilePromise, storesHeadPromise, cmsPackPromise]);

  const [banner, services, sections] = cmsPack;

  const storeRows = storesHead.data as unknown;
  const hasOwnerStore = Array.isArray(storeRows) && storeRows.length > 0;

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
    viewerIdForHub: userId,
  };
});

/**
 * `/mypage` **탭·모바일 섹션 진입**용 — 허브·홈 대시보드 숫자는 RSC에서 생략.
 * `useMypageHubModel` 이 주소·거래·매장 요약을 클라에서 채운다.
 */
export const loadMypageServerShell = cache(async (): Promise<MyPageData | null> => {
  const row = await loadMypageCoreCached();
  if (!row) return null;
  const { viewerIdForHub: _v, ...core } = row;
  void _v;
  return {
    ...core,
    hubServerExtras: null,
    homeDashboardCounts: null,
  };
});

/**
 * 허브·대시보드까지 포함한 전체 — 동일 요청 내 `loadMypageCoreCached` 는 한 번만 실행된다.
 * `(main)/mypage` 루트·섹션 진입은 `loadMypageServerShell` — 허브·홈 대시보드 숫자는 `useMypageHubModel`·`MyPageHomeDashboard` 가 클라에서 채움.
 * 전체(`loadMypageServer`)는 다른 서버 전용 경로가 필요할 때만 사용한다.
 */
export const loadMypageServer = cache(async (): Promise<MyPageData | null> => {
  const row = await loadMypageCoreCached();
  if (!row) return null;
  const { viewerIdForHub, ...core } = row;

  const [hubServerExtras, homeDashboardCounts] = await Promise.all([
    loadMypageHubExtrasServer(viewerIdForHub, row.hasOwnerStore),
    loadMypageHomeDashboardCountsServer(viewerIdForHub),
  ]);

  return {
    ...core,
    hubServerExtras,
    homeDashboardCounts,
  };
});
