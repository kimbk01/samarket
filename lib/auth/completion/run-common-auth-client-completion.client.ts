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
import {
  bumpAuthLifecycleCounter,
  completeAuthLifecycle,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import { markCallMediaOnboardingPendingSource } from "@/lib/permissions/dibay-device-permission-onboarding";

type RouterLike = {
  replace: (href: string) => void;
};

export type RunCommonAuthClientCompletionInput = {
  destination: string;
  router?: RouterLike;
  /**
   * Native exchange Set-Cookie path — run syncCommonClientSessionAfterAuth once.
   * Sync failure MUST block navigation (Slice 6-3 POLICY_A).
   */
  syncFromNativeExchangeCookies?: boolean;
  onCloseModal?: () => void;
  /** 같은 로그인에서 `prepareCommonAuthClientSession` 을 이미 거쳤으면 그 결과 — 준비를 두 번 하지 않는다 */
  prepared?: Extract<PrepareCommonAuthClientSessionResult, { ok: true }>;
};

export type RunCommonAuthClientCompletionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "client_session_sync_failed" | "android_cookie_flush_failed" | "empty_destination";
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

/**
 * Non-blocking post-nav warm — must not duplicate full profile fetch.
 * SSOT: ensureAppBoot lite (+ destination page resolve). Completion must not
 * race a second full `/api/me/profile` against boot/mypage.
 */
function scheduleNonBlockingPostLoginWork(): void {
  void ensureAppBoot();
}

export type PrepareCommonAuthClientSessionResult =
  | { ok: true; cookieFlush: Awaited<ReturnType<typeof flushAndroidAuthCookies>> }
  | { ok: false; reason: "client_session_sync_failed" | "android_cookie_flush_failed" };

/**
 * 로그인 완료 공통 준비(이동 없음) — 모든 앱 안 로그인 완료가 이 한 함수를 거친다.
 * 손님 캐시·부팅 갱신 → 로그아웃 표시 삭제 → 세션 동기화(앱 안 SDK 쿠키 / 세션 준비) → Android 쿠키 저장.
 * 「로그인 필요」 창 로그인(`finishClientAuthLogin` 대기 동작 분기)도 같은 준비를 거친다 — 예전에는 세션 준비만 해서
 * 로그아웃 뒤 표시가 남아 로그인 사용자 값이 막히고 부팅이 「익명」에 남았다
 * (docs/audit/signup-mypage-skeleton-fix-design-2026-11-27.md §8).
 */
export async function prepareCommonAuthClientSession(input: {
  syncFromNativeExchangeCookies?: boolean;
}): Promise<PrepareCommonAuthClientSessionResult> {
  invalidateGuestCachesForFreshLogin();
  clearPostLogoutBfcacheGuard();
  markCallMediaOnboardingPendingSource("first_login");

  if (input.syncFromNativeExchangeCookies) {
    const synced = await syncCommonClientSessionAfterAuth();
    if (!synced) {
      markAuthLifecycleStage("client_session_visible", {
        primed: false,
        via: "syncCommonClientSessionAfterAuth",
      });
      completeAuthLifecycle("fail", { reason: "client_session_sync_failed" });
      return { ok: false, reason: "client_session_sync_failed" };
    }
    markAuthLifecycleStage("client_session_visible", {
      primed: true,
      via: "syncCommonClientSessionAfterAuth",
    });
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
    return { ok: false, reason: "android_cookie_flush_failed" };
  }
  return { ok: true, cookieFlush };
}

/**
 * Common Navigation + interim interaction_ready (Slice 2-1).
 *
 * CONTRACT:
 * - navigation exactly once on success
 * - native syncFromNativeExchangeCookies: syncCommonClientSessionAfterAuth once; failure → navigation 0
 * - no background signup-status re-navigation
 * - interaction_ready once after that navigation (440ms moves this in Slice 2-6)
 * - Badge/device/messenger must not block (ensureAppBoot is fire-and-forget)
 */
export async function runCommonAuthClientCompletion(
  input: RunCommonAuthClientCompletionInput,
): Promise<RunCommonAuthClientCompletionResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "empty_destination" };
  }

  input.onCloseModal?.();
  const prepared =
    input.prepared ??
    (await prepareCommonAuthClientSession({
      syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies,
    }));
  if (!prepared.ok) return { ok: false, reason: prepared.reason };
  const { cookieFlush } = prepared;

  const target = input.destination.trim();
  if (!target) {
    completeAuthLifecycle("fail", { reason: "empty_destination" });
    return { ok: false, reason: "empty_destination" };
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
    return { ok: true };
  }

  bumpAuthLifecycleCounter("fullDocumentRedirect");
  window.location.replace(target);
  return { ok: true };
}
