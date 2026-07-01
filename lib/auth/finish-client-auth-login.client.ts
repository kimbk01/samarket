"use client";

import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { primeClientAuthSessionFromSupabase } from "@/lib/auth/auth-session-immediate.client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import {
  clearPostLogoutBfcacheGuard,
  invalidateGuestCachesForFreshLogin,
} from "@/lib/auth/client-session-wipe";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import {
  clearStoredLoginRequiredDetail,
  consumePendingAuthAction,
} from "@/lib/auth/require-auth-action";
import { sanitizeFreshLoginLandingPath, sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import { markCallMediaOnboardingPendingSource } from "@/lib/permissions/dibay-device-permission-onboarding";

type RouterLike = {
  replace: (href: string) => void;
};

const SIGNUP_STATUS_ROUTE_TIMEOUT_MS = 900;

export type FinishClientAuthLoginInput = {
  redirectTo?: string | null;
  pendingToken?: string | null;
  next?: string | null;
  onCloseModal?: () => void;
  router?: RouterLike;
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

/** Navigation 직전 — redirectTo·next 만으로 즉시 확정 (signup-status blocking 없음). */
function resolveImmediateLoginTarget(input: {
  redirectTo?: string | null;
  next?: string | null;
}): string {
  const fromExchange = input.redirectTo?.trim()
    ? sanitizeFreshLoginLandingPath(input.redirectTo.trim())
    : null;
  if (fromExchange) return fromExchange;
  return sanitizeFreshLoginLandingPath(input.next) ?? POST_LOGIN_PATH;
}

/** Background — onboarding 등 signup-status route 보정 (navigation gate 아님). */
async function resolveLoginTargetFromSignupStatus(input: {
  redirectTo?: string | null;
  next?: string | null;
}): Promise<string> {
  const fromExchange = input.redirectTo?.trim()
    ? sanitizeFreshLoginLandingPath(input.redirectTo.trim())
    : null;
  if (fromExchange) return fromExchange;

  const handoffNext = sanitizeNextPath(input.next ?? null) ?? undefined;
  const fallback = sanitizeFreshLoginLandingPath(input.next) ?? POST_LOGIN_PATH;

  try {
    const { status, json } = await Promise.race([
      fetchSignupStatusDeduped(handoffNext),
      new Promise<{
        status: number;
        json: null;
      }>((resolve) =>
        window.setTimeout(() => resolve({ status: 0, json: null }), SIGNUP_STATUS_ROUTE_TIMEOUT_MS)
      ),
    ]);
    if (status === 200 && json?.route?.trim()) {
      return sanitizeFreshLoginLandingPath(json.route.trim()) ?? POST_LOGIN_PATH;
    }
  } catch {
    /* fallback */
  }
  return fallback;
}

/** Native/Web OAuth 직후 — JWT 캐시만 있고 profiles API 가 아직 비어 보이는 레이스 완화 */
async function primeClientProfileRowAfterLogin(): Promise<void> {
  try {
    const { status, json } = await fetchMeProfileDeduped();
    const payload = json as { ok?: boolean; profile?: Record<string, unknown> | null } | null;
    if (status >= 200 && status < 300 && payload?.ok && payload.profile && typeof payload.profile.id === "string") {
      setSupabaseProfileCache(profileRowToClientProfile(payload.profile as never));
    }
  } catch {
    /* redirect 는 계속 */
  }
}

function schedulePostLoginBackgroundWork(input: {
  redirectTo?: string | null;
  next?: string | null;
  immediateTarget: string;
  router?: RouterLike;
}): void {
  void primeClientProfileRowAfterLogin();
  void ensureAppBoot();

  if (input.redirectTo?.trim()) return;

  void (async () => {
    const resolved = await resolveLoginTargetFromSignupStatus({
      redirectTo: input.redirectTo,
      next: input.next,
    });
    if (resolved === input.immediateTarget) return;
    if (input.router && canUseRouterReplace(resolved)) {
      input.router.replace(resolved);
      return;
    }
    if (typeof window !== "undefined" && resolved !== input.immediateTarget) {
      window.location.replace(resolved);
    }
  })();
}

export async function finishClientAuthLogin(input: FinishClientAuthLoginInput): Promise<void> {
  const { redirectTo, pendingToken, next, onCloseModal, router } = input;

  if (typeof window === "undefined") return;

  if (pendingToken?.trim()) {
    await primeClientAuthSessionFromSupabase();
    const consumed = await consumePendingAuthAction(pendingToken);
    clearStoredLoginRequiredDetail();
    onCloseModal?.();
    if (consumed) {
      void ensureAppBoot();
      return;
    }
  }

  clearStoredLoginRequiredDetail();
  onCloseModal?.();

  invalidateGuestCachesForFreshLogin();
  clearPostLogoutBfcacheGuard();

  await primeClientAuthSessionFromSupabase();
  markCallMediaOnboardingPendingSource("first_login");

  const target = resolveImmediateLoginTarget({ redirectTo, next });

  if (router && canUseRouterReplace(target)) {
    router.replace(target);
    schedulePostLoginBackgroundWork({ redirectTo, next, immediateTarget: target, router });
    return;
  }

  schedulePostLoginBackgroundWork({ redirectTo, next, immediateTarget: target, router });
  window.location.replace(target);
}
