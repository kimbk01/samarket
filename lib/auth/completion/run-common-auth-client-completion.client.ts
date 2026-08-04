"use client";

import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { flushAndroidAuthCookies } from "@/lib/auth/android-cookie-durability.client";
import { primeClientAuthSessionFromSupabase } from "@/lib/auth/auth-session-immediate.client";
import {
  clearPostLogoutBfcacheGuard,
  invalidateGuestCachesForFreshLogin,
} from "@/lib/auth/client-session-wipe";
import { syncCommonClientSessionAfterAuth } from "@/lib/auth/completion/sync-common-client-session.client";
import { INTERACTION_READY_POLICY } from "@/lib/auth/completion/types";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import {
  bumpAuthLifecycleCounter,
  completeAuthLifecycle,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import { markCallMediaOnboardingPendingSource } from "@/lib/permissions/dibay-device-permission-onboarding";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";

type RouterLike = {
  replace: (href: string) => void;
};

export type RunCommonAuthClientCompletionInput = {
  destination: string;
  router?: RouterLike;
  /** When true, run syncCommonClientSessionAfterAuth before prime (native exchange). */
  syncFromNativeExchangeCookies?: boolean;
  onCloseModal?: () => void;
};

function canUseRouterReplace(target: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(target, window.location.origin);
    return url.origin === window.location.origin && url.protocol.startsWith("http");
  } catch {
    return false;
  }
}

/** Non-blocking profile cache warm — must not navigate. */
function scheduleNonBlockingPostLoginWork(): void {
  void (async () => {
    try {
      const { status, json } = await fetchMeProfileDeduped();
      const payload = json as { ok?: boolean; profile?: Record<string, unknown> | null } | null;
      if (
        status >= 200
        && status < 300
        && payload?.ok
        && payload.profile
        && typeof payload.profile.id === "string"
      ) {
        setSupabaseProfileCache(profileRowToClientProfile(payload.profile as never));
      }
    } catch {
      /* non-blocking */
    }
  })();
  void ensureAppBoot();
}

/**
 * Common Navigation + interim interaction_ready (Slice 2-1).
 *
 * CONTRACT:
 * - navigation exactly once
 * - no background signup-status re-navigation
 * - interaction_ready once after that navigation (440ms moves this in Slice 2-6)
 * - Badge/device/messenger must not block (ensureAppBoot is fire-and-forget)
 */
export async function runCommonAuthClientCompletion(
  input: RunCommonAuthClientCompletionInput,
): Promise<void> {
  if (typeof window === "undefined") return;

  input.onCloseModal?.();
  invalidateGuestCachesForFreshLogin();
  clearPostLogoutBfcacheGuard();
  markCallMediaOnboardingPendingSource("first_login");

  if (input.syncFromNativeExchangeCookies) {
    await syncCommonClientSessionAfterAuth();
  } else {
    const sessionPresent = await primeClientAuthSessionFromSupabase();
    markAuthLifecycleStage("client_session_visible", {
      sessionPresent,
      via: "runCommonAuthClientCompletion_prime",
    });
  }

  // Android: persist CookieManager memory cookies to disk before navigation.
  // Old APK without bridge → bridge_unavailable (continue). Flush false → fail completion.
  const cookieFlush = await flushAndroidAuthCookies("login_completion");
  if (cookieFlush === "flush_failed") {
    completeAuthLifecycle("fail", { reason: "android_cookie_flush_failed" });
    return;
  }

  const target = input.destination.trim();
  if (!target) {
    completeAuthLifecycle("fail", { reason: "empty_destination" });
    return;
  }

  bumpAuthLifecycleCounter("navigation");
  markAuthLifecycleStage("navigation_committed", {
    target,
    via: "runCommonAuthClientCompletion",
    androidCookieFlush: cookieFlush,
  });

  // Slice 2-6: move after Auth Entry 440ms. Interim policy is single-nav.
  void INTERACTION_READY_POLICY;
  markAuthLifecycleStage("interaction_ready", {
    note: "after_single_navigation_interim",
    policy: INTERACTION_READY_POLICY,
  });
  completeAuthLifecycle("ok", { target, via: "runCommonAuthClientCompletion" });

  scheduleNonBlockingPostLoginWork();

  if (input.router && canUseRouterReplace(target)) {
    input.router.replace(target);
    return;
  }

  bumpAuthLifecycleCounter("fullDocumentRedirect");
  window.location.replace(target);
}
