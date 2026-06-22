import { cache } from "react";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { runMeProfileReadPipeline } from "@/lib/profile/me-profile-read-pipeline";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { MyPageData } from "./types";
import { defaultMypageCmsPack, loadMypageCmsPack } from "@/lib/my/load-mypage-cms-pack";
import { loadMypageHubExtrasServer } from "@/lib/my/load-mypage-hub-extras-server";
import { loadMypageHomeDashboardCountsServer } from "@/lib/my/load-mypage-home-dashboard-counts-server";
import { loadAddressDefaultsSnapshotServer } from "@/lib/addresses/load-address-defaults-snapshot-server";
import { isMandatoryAddressGateSatisfied } from "@/lib/addresses/user-address-service";
import { deriveProfileCompletionState } from "@/lib/profile/profile-completion-state";

const MYPAGE_CMS_PACK_TIMEOUT_MS = 180;

function isAdminProfileRole(role: string | null | undefined): boolean {
  return isPrivilegedAdminRole(role);
}

/** 프로필·CMS·매장 보유 + `loadMypageHubExtrasServer` 용 라우트 user id */
type MypageCoreInternal = Omit<MyPageData, "hubServerExtras" | "homeDashboardCounts"> & { viewerIdForHub: string };

function defaultCmsPack() {
  const pack = defaultMypageCmsPack();
  return [pack.banner, pack.services, pack.sections] as const;
}

async function resolveMypageProfileCompletion(
  userId: string,
  profile: MypageCoreInternal["profile"],
): Promise<ReturnType<typeof deriveProfileCompletionState>> {
  let hasDefaultAddress = false;
  const sbStores = tryGetSupabaseForStores();
  if (sbStores && userId.trim()) {
    try {
      hasDefaultAddress = await isMandatoryAddressGateSatisfied(sbStores, userId);
    } catch {
      hasDefaultAddress = false;
    }
  }
  return deriveProfileCompletionState(profile, { hasDefaultAddress });
}

const loadMypageCoreCached = cache(async (): Promise<MypageCoreInternal | null> => {
  const userId = await getRouteUserId();
  if (!userId) return null;

  const userSb = await createSupabaseRouteHandlerClient();
  const sbStores = tryGetSupabaseForStores();

  const profilePromise = userSb
    ? (async () => {
        const {
          data: { user },
        } = await userSb.auth.getUser();
        const supabaseUser = user?.id === userId ? user : null;
        const svc = tryCreateSupabaseServiceClient();
        return runMeProfileReadPipeline({
          authUserId: userId,
          supabaseUser,
          routeSb: userSb,
          serviceSb: svc,
        });
      })()
    : Promise.resolve(null);

  const storesHeadPromise =
    sbStores != null
      ? sbStores.from("stores").select("id").eq("owner_user_id", userId).limit(1)
      : Promise.resolve({ data: null as unknown });

  const loadCmsPack = async () => {
    if (!userSb) return defaultCmsPack();
    const cmsPack = await loadMypageCmsPack(userSb);
    return [cmsPack.banner, cmsPack.services, cmsPack.sections] as const;
  };
  const loadCmsPackWithTimeout = async () => {
    try {
      return await Promise.race([
        loadCmsPack(),
        new Promise<ReturnType<typeof defaultCmsPack>>((resolve) => {
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
 * `/mypage` **탭 first paint** — lite profile + ProfileCompletionState 만 RSC seed.
 * CMS·stat·hub extras 는 클라 `useMypageHubModel` lazy.
 */
export const loadMypageServerShell = cache(async (): Promise<MyPageData | null> => {
  const row = await loadMypageCoreCached();
  if (!row) return null;
  const { viewerIdForHub, ...core } = row;
  const profileCompletion = await resolveMypageProfileCompletion(viewerIdForHub, row.profile);
  return {
    ...core,
    banner: null,
    bannerHidden: true,
    services: [],
    sections: [],
    hubServerExtras: null,
    homeDashboardCounts: null,
    addressDefaultsSnapshot: null,
    profileCompletion,
  };
});

/**
 * 허브·대시보드까지 포함한 전체 — 동일 요청 내 `loadMypageCoreCached` 는 한 번만 실행된다.
 * `(main)/mypage` 루트·섹션 진입은 `loadMypageServerShell` — RSC seed 후 클라는 갱신만.
 * 전체(`loadMypageServer`)는 다른 서버 전용 경로가 필요할 때만 사용한다.
 */
export const loadMypageServer = cache(async (): Promise<MyPageData | null> => {
  const row = await loadMypageCoreCached();
  if (!row) return null;
  const { viewerIdForHub, ...core } = row;

  const [hubServerExtras, homeDashboardCounts, addressDefaultsSnapshot, profileCompletion] =
    await Promise.all([
      loadMypageHubExtrasServer(viewerIdForHub, row.hasOwnerStore),
      loadMypageHomeDashboardCountsServer(viewerIdForHub),
      loadAddressDefaultsSnapshotServer(viewerIdForHub),
      resolveMypageProfileCompletion(viewerIdForHub, row.profile),
    ]);

  return {
    ...core,
    hubServerExtras,
    homeDashboardCounts,
    addressDefaultsSnapshot,
    profileCompletion,
  };
});
