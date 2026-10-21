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
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
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
  /**
   * Native exchange cookie handoff — Completion owns syncCommonClientSessionAfterAuth (Slice 6-3).
   * Email / session restore omit or false (prime-only).
   */
  syncFromNativeExchangeCookies?: boolean;
};

export type FinishClientAuthLoginInput = FinishClientAuthLoginTermsHandoff & {
  redirectTo?: string | null;
  pendingToken?: string | null;
  next?: string | null;
  onCloseModal?: () => void;
  router?: RouterLike;
};

/** Thrown when native client session sync fails — must not navigate as logged-in. */
export class CommonClientSessionSyncError extends Error {
  readonly code = "native_exchange_session_unavailable";

  constructor(message?: string) {
    super(message ?? "Client session was not established after login");
    this.name = "native_exchange_session_unavailable";
  }
}

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
 * P1-9 (SG-01): 아이디(password) 로그인은 exchange handoff 가 없으므로 성공 직후 signup-status 를 1회 읽어
 * `consentComplete` 를 전달한다 — 미동의면 resolveImmediateLoginTarget 이 terms 로 보낸다 (Destination 의미 불변).
 * 조회 실패 시 빈 handoff (기존 동작) — 이후 DibaySignupGate·API 403 이 동의 화면으로 복구한다.
 */
export async function resolvePasswordLoginTermsHandoff(
  next?: string | null,
): Promise<FinishClientAuthLoginTermsHandoff> {
  try {
    const { status, json } = await fetchSignupStatusDeduped(next ?? null);
    if (status !== 200 || !json?.signup) return {};
    return {
      consentComplete: json.signup.consentComplete === true,
      signupComplete: json.signup.signupComplete === true,
    };
  } catch {
    return {};
  }
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

  const completion = await runCommonAuthClientCompletion({
    destination: target,
    router,
    onCloseModal,
    syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
  });
  if (!completion.ok && completion.reason === "client_session_sync_failed") {
    throw new CommonClientSessionSyncError();
  }
}
