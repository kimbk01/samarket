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

type RouterLike = {
  replace: (href: string) => void;
};

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

async function resolveLoginTarget(input: {
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
    const { status, json } = await fetchSignupStatusDeduped(handoffNext);
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
  await primeClientProfileRowAfterLogin();

  const target = await resolveLoginTarget({ redirectTo, next });

  if (router && canUseRouterReplace(target)) {
    router.replace(target);
    void ensureAppBoot();
    return;
  }

  void ensureAppBoot();
  window.location.replace(target);
}
