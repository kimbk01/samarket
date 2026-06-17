"use client";

import { getAppBootSnapshot, setAppBootLoading } from "@/lib/app-boot/app-boot-store";
import { invalidateAppBootProfileCache } from "@/lib/app-boot/fetch-app-boot-profile";
import { invalidateAppBootFlight } from "@/lib/app-boot/run-app-boot";
import { clearAuthSessionClientCache } from "@/lib/auth/fetch-auth-session-client";
import { clearGuestAuthState } from "@/lib/auth/guest-auth-state";
import { invalidateClientMembershipResolveFlight } from "@/lib/auth/resolve-client-profile-session";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

/**
 * Supabase 세션 확정 직후 — WebView cold start 에서 조기 guest gate 가 걸린 경우 해제·재부트.
 * `INITIAL_SESSION` null → 이후 `SIGNED_IN`/`TOKEN_REFRESHED` 레이스 복구용.
 */
export function reconcileAuthenticatedClientSession(source: string): void {
  clearGuestAuthState();
  clearAuthSessionClientCache();
  invalidateClientMembershipResolveFlight();
  invalidateMeProfileDedupedCache();
  invalidateAppBootProfileCache();

  const boot = getAppBootSnapshot();
  if (boot.status === "anonymous" || boot.status === "idle" || (boot.status === "ready" && !boot.profile)) {
    invalidateAppBootFlight();
    setAppBootLoading();
  }

  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info(
      "[dibay_auth_reconcile]",
      JSON.stringify({
        at: Date.now(),
        source,
        bootStatusBefore: boot.status,
        hadProfile: !!boot.profile,
      }),
    );
  }
}
