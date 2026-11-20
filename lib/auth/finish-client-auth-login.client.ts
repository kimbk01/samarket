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
import { isRegistrationStepPath } from "@/lib/auth/dibay-registration-steps";
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
   * 아이디 로그인 — signup-status `route` 가 가입 단계 화면(전화·주소)이면 그곳으로 (가입 = 동의 + 전화 + 주소).
   * 가입 단계 경로가 아니면 무시한다.
   */
  registrationRoute?: string | null;
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

/**
 * 그 밖의 완료 실패(Android 쿠키 flush 실패·빈 목적지) — 이동 0회.
 * 조용히 반환하면 화면이 「로그인 중」에 멈추므로 호출부가 실패 상태로 복구하도록 던진다.
 */
export class CommonAuthCompletionError extends Error {
  readonly code = "auth_completion_failed";

  constructor(readonly reason: string) {
    super(`Login completion failed: ${reason}`);
    this.name = "auth_completion_failed";
  }
}

function requiresTermsAgreementHandoff(input: FinishClientAuthLoginTermsHandoff): boolean {
  if (input.needsTermsAgreement === true) return true;
  if (input.consentComplete === false) return true;
  return false;
}

/**
 * 가입 단계 화면 경로만 통과 — `sanitizeNextPath`·fresh-landing 검증은 /auth/* 를 금지 경로로 거르므로 쓰지 않고,
 * 단계 화면 3개(`/auth/onboarding/{terms,phone,address}`)만 정확히 허용한다.
 */
function pickRegistrationStepRoute(value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  return isRegistrationStepPath(v) ? v : null;
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

  // 가입 단계 화면(전화·주소) — 아이디 로그인은 signup-status `route`, 네이티브·QR 은 서버 목적지 `redirectTo`.
  const registrationRoute = pickRegistrationStepRoute(input.registrationRoute) ?? pickRegistrationStepRoute(input.redirectTo);
  if (registrationRoute) return registrationRoute;

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

  const completion = await runCommonAuthClientCompletion({
    destination: target,
    router,
    onCloseModal,
    syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
  });
  if (!completion.ok && completion.reason === "client_session_sync_failed") {
    throw new CommonClientSessionSyncError();
  }
  if (!completion.ok) {
    throw new CommonAuthCompletionError(completion.reason);
  }
}
