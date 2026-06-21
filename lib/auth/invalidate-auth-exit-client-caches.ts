"use client";

/**
 * 로그아웃·계정 전환·재로그인 직전 — user-scoped in-memory·deduped 캐시 일괄 무효화.
 * `wipeClientSessionState` 단일 진입점에서만 호출한다.
 */
import { invalidateAuthLightSessionSnapshotCache } from "@/lib/auth/auth-light-session-snapshot-cache";
import { invalidateCurrentUserIdCache } from "@/lib/auth/get-current-user";
import { invalidateMandatoryAddressGateClientCache } from "@/lib/addresses/mandatory-address-gate-client";
import { clearProfileSetupDeferForSession } from "@/lib/auth/profile-setup-defer.client";
import { invalidateMainBottomNavDedupedCache } from "@/lib/app/fetch-main-bottom-nav-deduped";
import { invalidateMessengerIceServerCache } from "@/lib/call/ice-servers";
import { resetHomeSyncSnapshotInvalidationRegistry } from "@/lib/community-messenger/home-sync-snapshot-invalidation-registry";
import { invalidateFavoriteCountClientCache } from "@/lib/favorites/getMyFavoriteCount";
import {
  invalidateMeNotificationsListDedupedCache,
  pauseMeNotificationsListDedupedAfterAuthExit,
} from "@/lib/me/fetch-me-notifications-deduped";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";
import { invalidateAllTradeFeedClientCache } from "@/lib/posts/trade-feed-client-cache";
import { invalidateOwnerHubDashboardOrdersCache } from "@/lib/stores/owner-hub-dashboard-orders-cache";
import { invalidateOwnerHubOrderCountsCache } from "@/lib/stores/owner-hub-order-counts-cache";
import { invalidateOwnerStoreOwnershipCache } from "@/lib/stores/owner-store-ownership-cache";

export async function clearBrowserCacheStorageBestEffort(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("caches" in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  } catch {
    /* ignore */
  }
}

export function invalidateAuthExitClientCaches(previousUserId?: string | null): void {
  invalidateCurrentUserIdCache();
  invalidateMeStoresListDedupedCache();
  invalidateMainBottomNavDedupedCache();
  invalidateMeNotificationsListDedupedCache();
  pauseMeNotificationsListDedupedAfterAuthExit();
  invalidateFavoriteCountClientCache();
  invalidateOwnerHubDashboardOrdersCache();
  invalidateOwnerHubOrderCountsCache();
  resetHomeSyncSnapshotInvalidationRegistry();
  invalidateAuthLightSessionSnapshotCache(previousUserId ?? undefined);
  invalidateAllTradeFeedClientCache();
  invalidateMandatoryAddressGateClientCache();
  clearProfileSetupDeferForSession();
  invalidateOwnerStoreOwnershipCache(previousUserId ?? undefined);
  invalidateMessengerIceServerCache();
}
