"use client";

import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { primeClientAuthSessionFromSupabase } from "@/lib/auth/auth-session-immediate.client";
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

  const target = await resolveLoginTarget({ redirectTo, next });

  if (router && canUseRouterReplace(target)) {
    router.replace(target);
    void ensureAppBoot();
    return;
  }

  void ensureAppBoot();
  window.location.replace(target);
}
