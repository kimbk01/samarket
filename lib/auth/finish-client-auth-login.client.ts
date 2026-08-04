"use client";

import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { primeClientAuthSessionFromSupabase } from "@/lib/auth/auth-session-immediate.client";
import { runCommonAuthClientCompletion } from "@/lib/auth/completion/run-common-auth-client-completion.client";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import {
  clearStoredLoginRequiredDetail,
  consumePendingAuthAction,
} from "@/lib/auth/require-auth-action";
import { DIBAY_SIGNUP_TERMS_PATH } from "@/lib/auth/dibay-signup-status";
import {
  sanitizeFreshLoginLandingPath,
  sanitizeNextPath,
  withNextSearchParam,
} from "@/lib/auth/safe-next-path";
import {
  bumpAuthLifecycleCounter,
  completeAuthLifecycle,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";

type RouterLike = {
  replace: (href: string) => void;
};

/** Native exchange 등에서 전달 — 약관 미동의 시 redirectTo보다 우선 */
export type FinishClientAuthLoginTermsHandoff = {
  needsTermsAgreement?: boolean | null;
  consentComplete?: boolean | null;
  signupComplete?: boolean | null;
};

export type FinishClientAuthLoginInput = FinishClientAuthLoginTermsHandoff & {
  redirectTo?: string | null;
  pendingToken?: string | null;
  next?: string | null;
  onCloseModal?: () => void;
  router?: RouterLike;
};

function requiresTermsAgreementHandoff(input: FinishClientAuthLoginTermsHandoff): boolean {
  if (input.needsTermsAgreement === true) return true;
  if (input.consentComplete === false) return true;
  return false;
}

/**
 * Navigation 직전 — 약관 미동의는 exchange redirectTo(/mypage 등)보다 우선.
 * Destination is resolved once here — no background signup-status re-navigation.
 */
export function resolveImmediateLoginTarget(
  input: FinishClientAuthLoginTermsHandoff & {
    redirectTo?: string | null;
    next?: string | null;
  },
): string {
  const safeNext = sanitizeNextPath(input.next ?? null);
  if (requiresTermsAgreementHandoff(input)) {
    return withNextSearchParam(DIBAY_SIGNUP_TERMS_PATH, safeNext);
  }

  const fromExchange = input.redirectTo?.trim()
    ? sanitizeFreshLoginLandingPath(input.redirectTo.trim())
    : null;
  if (fromExchange) return fromExchange;
  return sanitizeFreshLoginLandingPath(input.next) ?? POST_LOGIN_PATH;
}

/**
 * Client login handoff — delegates navigation/ready to Common Auth Completion.
 * Background signup-status corrective navigation is removed (Slice 2-1).
 */
export async function finishClientAuthLogin(input: FinishClientAuthLoginInput): Promise<void> {
  const { pendingToken, onCloseModal, router } = input;

  if (typeof window === "undefined") return;
  bumpAuthLifecycleCounter("finishClientAuthLogin");

  if (pendingToken?.trim()) {
    await primeClientAuthSessionFromSupabase();
    const consumed = await consumePendingAuthAction(pendingToken);
    clearStoredLoginRequiredDetail();
    onCloseModal?.();
    if (consumed) {
      markAuthLifecycleStage("navigation_committed", { via: "pending_token_consumed" });
      completeAuthLifecycle("ok", { via: "pending_token" });
      void ensureAppBoot();
      return;
    }
  }

  clearStoredLoginRequiredDetail();

  const target = resolveImmediateLoginTarget(input);
  markAuthLifecycleStage("onboarding_resolved", {
    target,
    needsTermsAgreement: input.needsTermsAgreement ?? null,
    signupComplete: input.signupComplete ?? null,
  });
  markAuthLifecycleStage("profile_resolved", {
    note: "profile_prime_scheduled_background",
  });

  await runCommonAuthClientCompletion({
    destination: target,
    router,
    onCloseModal,
    syncFromNativeExchangeCookies: false,
  });
}
