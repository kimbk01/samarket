"use client";

/**
 * 로그아웃·계정 전환·재로그인 직전 클라이언트 세션 완전 분리.
 * 제품 코드는 이 모듈의 `wipeClientSessionState` 만 호출한다.
 */

import { invalidateAppBootAll } from "@/components/app/AppBootProvider";
import { clearTradeChatRoomClientCache } from "@/lib/chat/createOrGetChatRoom";
import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { resetMessengerNotificationSurfacesAfterSignOut } from "@/lib/community-messenger/notifications/messenger-notification-surfaces-reset";
import { clearAllRoomSnapshotCaches } from "@/lib/community-messenger/room-snapshot-cache";
import { resetMessengerRealtimeStore } from "@/lib/community-messenger/stores/messenger-realtime-store";
import { resetMessengerNotificationStore } from "@/lib/community-messenger/stores/useNotificationStore";
import { useCallStore } from "@/lib/community-messenger/stores/useCallStore";
import { clearAuthSessionClientCache } from "@/lib/auth/fetch-auth-session-client";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import { invalidateMeAddressesListClientCache } from "@/lib/addresses/address-list-client-cache";
import { invalidateClientMembershipResolveFlight } from "@/lib/auth/resolve-client-profile-session";
import { pauseAndClearAllNotificationUnreadBadgeStores } from "@/lib/notifications/notification-unread-badge-store";
import { closeAllServiceWorkerNotifications } from "@/lib/push/push-manager";
import { clearUserSettingsClientCache } from "@/lib/settings/user-settings-store";
import { clearCommerceCartStorage } from "@/lib/stores/store-commerce-cart-storage";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { teardownCommunityMessengerCallOnAuthExit } from "@/lib/community-messenger/call-logout-teardown";
import { resetSignupGateSessionFlags } from "@/lib/auth/signup-gate-session";
import { clearPendingAuthActions } from "@/lib/auth/require-auth-action";
import { clearLoginBootstrapSnapshot } from "@/lib/auth/login-bootstrap-cache";
import { CLIENT_INSTANCE_PERSISTENT_KEYS, clearBoundAuthUserId, getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  DIBAY_DEVICE_PERSISTENT_STORAGE_KEYS,
  isDibayDevicePersistentKey,
  listUserScopedStorageKeysForUser,
} from "@/lib/auth/dibay-session-policy";
import { clearAllLocalRoomSnapshots } from "@/lib/community-messenger/local-store/roomSnapshotDb";
import { resetMessengerUIStore } from "@/lib/community-messenger/stores/useMessengerUIStore";
import { resetMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { resetMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import { resetMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import { resetAuthExitNavigateGuard } from "@/lib/auth/auth-exit-guard";
import {
  clearBrowserCacheStorageBestEffort,
  invalidateAuthExitClientCaches,
} from "@/lib/auth/invalidate-auth-exit-client-caches";
import { revokeNativeKakaoSessionIfAvailable } from "@/lib/auth/native/native-kakao-auth-plugin";

export type ClientSessionWipeReason = "user_logout" | "account_switched" | "pre_login_bootstrap";

export const POST_LOGOUT_BFCACHE_GUARD_KEY = "samarket:post_logout_guard";

const WIPE_SINGLE_FLIGHT_KEY = "client-session-wipe";
const EXPLICIT_LOGOUT_WIPE_SKIP_MS = 3_000;

let explicitLogoutWipeAt = 0;

const LOCAL_STORAGE_KEEP_KEYS = new Set<string>([
  ...DIBAY_DEVICE_PERSISTENT_STORAGE_KEYS,
  ...CLIENT_INSTANCE_PERSISTENT_KEYS,
]);

function clearEphemeralLocalStorage(options?: { exceptUserId?: string | null }): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || LOCAL_STORAGE_KEEP_KEYS.has(key) || isDibayDevicePersistentKey(key)) continue;
      keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    const exceptUserId = String(options?.exceptUserId ?? "").trim();
    if (exceptUserId) {
      for (const key of listUserScopedStorageKeysForUser(exceptUserId, localStorage)) {
        if (!LOCAL_STORAGE_KEEP_KEYS.has(key)) localStorage.removeItem(key);
      }
    }
  } catch {
    /* private mode · quota */
  }
}

/** account switch — 이전 user id scoped key 만 삭제 */
export function wipeUserScopedStorage(previousUserId: string): void {
  if (typeof window === "undefined") return;
  const uid = String(previousUserId ?? "").trim();
  if (!uid) return;
  try {
    for (const key of listUserScopedStorageKeysForUser(uid, localStorage)) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function wipeAllExceptDevicePrefs(): void {
  clearEphemeralLocalStorage();
}

function clearEphemeralSessionStorage(options: { setPostLogoutGuard: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.clear();
    if (options.setPostLogoutGuard) {
      sessionStorage.setItem(POST_LOGOUT_BFCACHE_GUARD_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

function resetInMemoryClientStores(): void {
  resetMessengerRealtimeStore();
  try {
    useCallStore.getState().resetCall();
  } catch {
    /* ignore */
  }
  resetMessengerNotificationStore();
  resetMessengerUIStore();
  resetMessengerPresenceStore();
  resetMessengerTypingStore();
  resetMessengerRoomReaderStateStore();
  pauseAndClearAllNotificationUnreadBadgeStores();
  clearAllRoomSnapshotCaches();
  clearTradeChatRoomClientCache();
  clearCommerceCartStorage();
  clearUserSettingsClientCache();
  invalidateHomePostsCache();
  clearPendingAuthActions();
  clearLoginBootstrapSnapshot();
}

function resetAddressClientCaches(): void {
  invalidateAddressDefaultsSnapshotCache();
  invalidateMeAddressesListClientCache();
  invalidateClientMembershipResolveFlight();
}

function resetAuthClientCaches(previousUserId?: string | null): void {
  invalidateAppBootAll();
  setSupabaseProfileCache(null);
  invalidateMeProfileDedupedCache();
  clearAuthSessionClientCache();
  clearBootstrapCache();
  resetAddressClientCaches();
  resetMessengerNotificationSurfacesAfterSignOut();
  invalidateAuthExitClientCaches(previousUserId);
}

function shouldClearBrowserCacheStorage(reason: ClientSessionWipeReason): boolean {
  return reason === "user_logout" || reason === "account_switched";
}

/** cold boot·세션 없음 INITIAL_SESSION — storage/realtime wipe 없이 auth·boot 캐시만 정리 */
export function syncSignedOutClientCaches(): void {
  if (typeof window === "undefined") return;
  resetAuthClientCaches();
  resetSignupGateSessionFlags();
  dispatchTestAuthChanged();
}

/** performClientLogout 직후 SIGNED_OUT 이벤트 중복 full wipe 방지 */
export function markExplicitLogoutWipeDone(): void {
  explicitLogoutWipeAt = Date.now();
}

export function shouldSkipSignedOutEventWipe(): boolean {
  return Date.now() - explicitLogoutWipeAt < EXPLICIT_LOGOUT_WIPE_SKIP_MS;
}

async function runWipeClientSessionState(
  reason: ClientSessionWipeReason,
  setPostLogoutGuard: boolean
): Promise<void> {
  if (reason === "user_logout" || reason === "account_switched") {
    await revokeNativeKakaoSessionIfAvailable();
  }
  const previousUserId = getBoundAuthUserId();
  await teardownCommunityMessengerCallOnAuthExit(
    reason === "account_switched" ? "account_switch" : "logout"
  );
  await disconnectSupabaseRealtime();
  resetInMemoryClientStores();
  await clearAllLocalRoomSnapshots();
  resetAuthClientCaches(previousUserId);
  resetSignupGateSessionFlags();
  clearEphemeralLocalStorage();
  clearBoundAuthUserId();
  clearEphemeralSessionStorage({ setPostLogoutGuard });
  closeAllServiceWorkerNotifications();
  if (shouldClearBrowserCacheStorage(reason)) {
    void clearBrowserCacheStorageBestEffort();
  }
  dispatchTestAuthChanged();
}

async function disconnectSupabaseRealtime(): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await sb.removeAllChannels();
  } catch {
    /* ignore */
  }
}

/**
 * @param options.setPostLogoutGuard — 로그아웃·SIGNED_OUT 시 bfcache 뒤로가기 reload 가드
 */
export async function wipeClientSessionState(
  reason: ClientSessionWipeReason,
  options?: { setPostLogoutGuard?: boolean }
): Promise<void> {
  if (typeof window === "undefined") return;

  const setPostLogoutGuard =
    options?.setPostLogoutGuard ??
    (reason === "user_logout" || reason === "account_switched");

  return runSingleFlight(WIPE_SINGLE_FLIGHT_KEY, () =>
    runWipeClientSessionState(reason, setPostLogoutGuard)
  );
}

/** 로그인 bootstrap 완료 후 bfcache 가드 해제 */
export function clearPostLogoutBfcacheGuard(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(POST_LOGOUT_BFCACHE_GUARD_KEY);
  } catch {
    /* ignore */
  }
  resetAuthExitNavigateGuard();
}
