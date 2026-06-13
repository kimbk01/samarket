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
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";
import { bindAuthUserId, detectAuthUserMismatch, getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { wipeUserScopedStorage } from "@/lib/auth/client-session-wipe";
import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import { runAuthAccountSwitchExit } from "@/lib/auth/auth-exit-coordinator";
import { bindDibaySessionManagerAuthListener, subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { dispatchOAuthPendingClear } from "@/lib/auth/oauth/use-oauth-login";

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

function handleAuthenticatedSession(
  sb: SupabaseClient,
  event: string,
  userId: string
): void {
  const accountMismatch =
    (lastKnownAuthUserId && lastKnownAuthUserId !== userId) || detectAuthUserMismatch(userId);

  if (accountMismatch) {
    const previousUserId = getBoundAuthUserId();
    void wipeClientSessionState("account_switched", { setPostLogoutGuard: true }).then(() => {
      if (previousUserId) wipeUserScopedStorage(previousUserId);
      bindAuthUserId(userId);
      if (typeof window !== "undefined" && isAccountDependentPath(window.location.pathname)) {
        void runAuthAccountSwitchExit();
        return;
      }
      void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));
    });
    lastKnownAuthUserId = userId;
    return;
  }

  lastKnownAuthUserId = userId;
  bindAuthUserId(userId);

  if (event === "SIGNED_IN") {
    void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));
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
        if (shouldSkipSignedOutEventWipe()) {
          return;
        }
        void wipeClientSessionState("user_logout");
        return;
      }

      if (event === "INITIAL_SESSION") {
        if (!session?.user?.id) {
          if (lastKnownAuthUserId) {
            lastKnownAuthUserId = null;
            void wipeClientSessionState("user_logout", { setPostLogoutGuard: false });
          } else {
            syncSignedOutClientCaches();
          }
        } else {
          handleAuthenticatedSession(sb, event, session.user.id);
        }
        return;
      }

      if (event === "SIGNED_IN" && session?.user?.id) {
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
