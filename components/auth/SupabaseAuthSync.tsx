"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  setSupabaseProfileCache,
  userToProfile,
  getSupabaseProfileCache,
} from "@/lib/auth/supabase-profile-cache";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import {
  wipeClientSessionState,
  syncSignedOutClientCaches,
  shouldSkipSignedOutEventWipe,
} from "@/lib/auth/client-session-wipe";
import { isExplicitLogoutIntentActive } from "@/lib/auth/explicit-logout-intent";
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { getAppBootSnapshot, peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";
import {
  bindAuthUserId,
  detectAuthUserMismatch,
  detectTabAuthUserSwitch,
  rememberTabAuthenticatedUserId,
} from "@/lib/auth/client-instance-id";
import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import { runAuthAccountSwitchExit } from "@/lib/auth/auth-exit-coordinator";
import { isAuthExitNavigateStarted, markAuthExitNavigateStarted } from "@/lib/auth/auth-exit-guard";
import { logGuestAuthBootMarker } from "@/lib/auth/guest-auth-boot-markers";
import { isTerminalGuestAuthEstablished } from "@/lib/auth/guest-auth-state";
import { bindDibaySessionManagerAuthListener, subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { dispatchOAuthPendingClear } from "@/lib/auth/oauth/use-oauth-login";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";

let lastKnownAuthUserId: string | null = null;

function applySupabaseProfileCacheFromBoot(sb: SupabaseClient): void {
  const bootProfile = peekAppBootProfile();
  if (bootProfile && getSupabaseProfileCache()?.id) {
    return;
  }

  void dedupeSupabaseAuthGetUser(sb).then(({ data: { user }, error }) => {
    if (!user) {
      if (shouldClearProfileCacheOnGetUserFailure(user, error)) {
        lastKnownAuthUserId = null;
        /**
         * CUT-A — boot already anonymous/terminal guest: wipe+re-ensure loops
         * (ready → syncSignedOut → idle → ensure → ready → …).
         */
        const bootStatus = getAppBootSnapshot().status;
        if (bootStatus === "anonymous" || isTerminalGuestAuthEstablished()) {
          return;
        }
        syncSignedOutClientCaches();
      }
      return;
    }

    let nextProfile = userToProfile(user);

    if (bootProfile) {
      const p = profileRowToClientProfile(bootProfile);
      nextProfile = {
        ...nextProfile,
        ...p,
        avatar_url: p.avatar_url ?? nextProfile?.avatar_url ?? null,
        temperature: p.temperature ?? nextProfile?.temperature ?? 50,
        auth_provider: p.auth_provider ?? nextProfile?.auth_provider ?? null,
      };
    }

    setSupabaseProfileCache(nextProfile);
    dispatchTestAuthChanged();
  });
}

/** 탭 메모리 계정 전환 — in-memory store·구독·컴포넌트 상태를 남기지 않도록 현재 URL 하드 리로드 1회 */
function hardReloadAfterTabAccountSwitch(): void {
  if (typeof window === "undefined") return;
  if (isAuthExitNavigateStarted()) return;
  markAuthExitNavigateStarted();
  const href = window.location.href;
  try {
    window.location.replace(href);
  } catch {
    window.location.href = href;
  }
}

function handleAuthenticatedSession(
  sb: SupabaseClient,
  event: string,
  userId: string
): void {
  /**
   * P0-2 — 이 탭 메모리가 A 였는데 B 가 들어옴 (다른 탭 로그아웃→B 로그인 포함).
   * bound id 는 다른 탭이 이미 B 로 다시 썼을 수 있으므로 탭 메모리로 판정 → wipe + 하드 리로드.
   */
  const tabSwitched =
    detectTabAuthUserSwitch(userId) || (!!lastKnownAuthUserId && lastKnownAuthUserId !== userId);
  const accountMismatch = tabSwitched || detectAuthUserMismatch(userId);

  if (accountMismatch) {
    void wipeClientSessionState("account_switched", { setPostLogoutGuard: true }).then(() => {
      bindAuthUserId(userId);
      if (typeof window !== "undefined" && isAccountDependentPath(window.location.pathname)) {
        void runAuthAccountSwitchExit();
        return;
      }
      if (tabSwitched) {
        hardReloadAfterTabAccountSwitch();
        return;
      }
      void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));
    });
    lastKnownAuthUserId = userId;
    rememberTabAuthenticatedUserId(userId);
    return;
  }

  lastKnownAuthUserId = userId;
  rememberTabAuthenticatedUserId(userId);
  bindAuthUserId(userId);

  if (event === "SIGNED_IN") {
    void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));
    // Guest → Member: reconcile THIS device's promotion lifecycle onto the member.
    void import("@/lib/platform-promotion-lifecycle/client-record-content-visit").then((m) => {
      m.reconcileGuestPromotionLifecycleClient();
    });
    return;
  }

  applySupabaseProfileCacheFromBoot(sb);
}

/**
 * Supabase 브라우저 세션 ↔ 프로필 캐시 — **GET /api/me/profile 은 AppBootProvider 1회만**.
 */
export function SupabaseAuthSync() {
  useEffect(() => {
    const unbindSessionManager = bindDibaySessionManagerAuthListener();
    const sb = getSupabaseClient();
    if (!sb) return unbindSessionManager;

    const onBootReady = () => applySupabaseProfileCacheFromBoot(sb);
    window.addEventListener(APP_BOOT_READY_EVENT, onBootReady);
    void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));

    const unsubAuthEvents = subscribeDibayAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        lastKnownAuthUserId = null;
        // Explicit logout owns wipe. Unexpected SIGNED_OUT must not clear persisted session.
        if (shouldSkipSignedOutEventWipe() || isExplicitLogoutIntentActive()) {
          return;
        }
        logGuestAuthBootMarker("signed_out_unexpected_no_wipe", {});
        syncSignedOutClientCaches();
        return;
      }

      if (event === "INITIAL_SESSION") {
        if (!session?.user?.id) {
          logGuestAuthBootMarker("initial_session_empty_recovering", {
            hadLastKnownUserId: !!lastKnownAuthUserId,
          });
          /**
           * CUT-A — marker `initial_session_empty_no_wipe` must mean no boot wipe.
           * Previous `syncSignedOutClientCaches()` → invalidateAppBootAll() aborted
           * in-flight ensureAppBoot (epoch bump + idle) and left /stores feedReady=0 forever.
           * Recoverable guest is already set by dibay-session-manager; AppBoot owns terminal anonymous.
           */
          logGuestAuthBootMarker("initial_session_empty_no_wipe", {
            hadLastKnownUserId: !!lastKnownAuthUserId,
          });
        } else {
          if (lastKnownAuthUserId && lastKnownAuthUserId === session.user.id) {
            logGuestAuthBootMarker("initial_session_recovered_authenticated", {
              userId: session.user.id,
            });
          }
          handleAuthenticatedSession(sb, event, session.user.id);
        }
        return;
      }

      if (event === "SIGNED_IN" && session?.user?.id) {
        logOAuthNativeEvent("exchange_success", {
          userId: session.user.id,
          provider: session.user.app_metadata?.provider ?? null,
        });
        dispatchOAuthPendingClear("exchange_success");
        handleAuthenticatedSession(sb, event, session.user.id);
      }
    });

    return () => {
      unsubAuthEvents();
      window.removeEventListener(APP_BOOT_READY_EVENT, onBootReady);
      unbindSessionManager();
    };
  }, []);

  return null;
}
