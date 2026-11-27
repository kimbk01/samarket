"use client";

import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import {
  prepareCommonAuthClientSession,
  runCommonAuthClientCompletion,
  type PrepareCommonAuthClientSessionResult,
} from "@/lib/auth/completion/run-common-auth-client-completion.client";
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

  let prepared: Extract<PrepareCommonAuthClientSessionResult, { ok: true }> | undefined;
  if (pendingToken?.trim()) {
    /**
     * 「로그인 필요」 창 로그인 — 다른 앱 안 로그인과 같은 공통 준비(손님 캐시·부팅 갱신 → 로그아웃 표시 삭제 → 세션 동기화).
     * 예전에는 세션 준비만 해서 로그아웃 뒤 표시가 남아 로그인 사용자 값이 막히고 부팅이 「익명」에 남았다
     * (docs/audit/signup-mypage-skeleton-fix-design-2026-11-27.md §8).
     */
    const result = await prepareCommonAuthClientSession({
      syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
    });
    if (!result.ok) {
      if (result.reason === "client_session_sync_failed") throw new CommonClientSessionSyncError();
      throw new CommonAuthCompletionError(result.reason);
    }
    prepared = result;
    /**
     * 준비가 부팅을 「갱신 대기」로 돌렸다 — 대기 동작(권한 창·프로필 완성 등 오래 걸리거나 실패할 수 있음)보다 먼저 부팅을 다시 시작해
     * 부팅이 대기 상태에 머물지 않게 한다(일반 완료의 `scheduleNonBlockingPostLoginWork` 와 같은 위치 · 진행 중이면 합류).
     */
    void ensureAppBoot();
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
    prepared,
  });
  if (!completion.ok && completion.reason === "client_session_sync_failed") {
    throw new CommonClientSessionSyncError();
  }
  if (!completion.ok) {
    throw new CommonAuthCompletionError(completion.reason);
  }
}
