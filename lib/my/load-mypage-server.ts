import { cache } from "react";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { MyPageData, MyPageBannerRow, MyServiceRow, MyPageSectionRow } from "./types";
import { DEFAULT_MY_SERVICES, DEFAULT_MY_SECTIONS } from "./my-page-defaults";
import { MY_PAGE_BANNERS_SELECT, MY_PAGE_SECTIONS_SELECT, MY_SERVICES_SELECT } from "@/lib/my/mypage-tables-select";
import { loadMypageHubExtrasServer } from "@/lib/my/load-mypage-hub-extras-server";
import { loadMypageHomeDashboardCountsServer } from "@/lib/my/load-mypage-home-dashboard-counts-server";

const MYPAGE_CMS_PACK_TIMEOUT_MS = 180;

function isAdminProfileRole(role: string | null | undefined): boolean {
  return isPrivilegedAdminRole(role);
}

/** 프로필·CMS·매장 보유 + `loadMypageHubExtrasServer` 용 라우트 user id */
type MypageCoreInternal = Omit<MyPageData, "hubServerExtras" | "homeDashboardCounts"> & { viewerIdForHub: string };

function defaultCmsPack(): [MyPageBannerRow | null, MyServiceRow[], MyPageSectionRow[]] {
  return [null, DEFAULT_MY_SERVICES, DEFAULT_MY_SECTIONS];
}

const loadMypageCoreCached = cache(async (): Promise<MypageCoreInternal | null> => {
  const userId = await getRouteUserId();
  if (!userId) return null;

  const userSb = await createSupabaseRouteHandlerClient();
  const sbStores = tryGetSupabaseForStores();

  const profilePromise = userSb
    ? (async () => {
        const existing = await fetchProfileRowSafe(userSb, userId);
        if (existing) return existing;
        try {
          const {
            data: { user },
          } = await userSb.auth.getUser();
          if (!user?.id || user.id !== userId) return null;
          /**
           * 1순위: service_role 보정 (트리거/제약을 모두 통과)
           * 2순위(service key 미설정): 본인 쿠키 클라이언트로 INSERT-only 보정
           *   - 트리거는 UPDATE 에만 걸리므로 신규 INSERT 는 허용
           *   - RLS `id = auth.uid()` 통과
           *   - `ensureAuthProfileRow` 의 minimal fallback 이 어떤 스키마에서도 row 생성
           */
          const svc = tryCreateSupabaseServiceClient();
          if (svc) {
            try {
              await ensureAuthProfileRow(svc, user);
            } catch {
              await ensureProfileForUserId(svc, userId);
            }
            const refreshed = await fetchProfileRowSafe(userSb, userId);
            if (refreshed) return refreshed;
            return await fetchProfileRowSafe(svc, userId);
          }
          try {
            await ensureAuthProfileRow(userSb, user);
          } catch {
            // 다음 호출(클라이언트 /api/auth/profile/ensure)에서도 동일 fallback 시도됨
          }
          return await fetchProfileRowSafe(userSb, userId);
        } catch {
          return null;
        }
      })()
    : Promise.resolve(null);

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
      return defaultCmsPack();
    }
  };
  const loadCmsPackWithTimeout = async (): Promise<[MyPageBannerRow | null, MyServiceRow[], MyPageSectionRow[]]> => {
    try {
      return await Promise.race([
        loadCmsPack(),
        new Promise<[MyPageBannerRow | null, MyServiceRow[], MyPageSectionRow[]]>((resolve) => {
          setTimeout(() => resolve(defaultCmsPack()), MYPAGE_CMS_PACK_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return defaultCmsPack();
    }
  };

  const cmsPackPromise = loadCmsPackWithTimeout();

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
  const isAdmin = isAdminProfileRole(profile?.role ?? null);

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
