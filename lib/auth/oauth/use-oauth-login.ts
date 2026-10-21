"use client";

/**
 * CONTRACT — OAuth login UX (배민·당근 스타일 인라인)
 * - 상태 전환은 `auth-login-phase.ts` 단일 정의 (idle → provider → returned → confirming → navigating)
 * - 성공 경로에서 pending 을 해제하지 않는다 — 화면 이탈(navigation)로 끝난다. 모달만 닫힌 뒤 해제.
 * - 타이머로 pending 을 해제(=실패 판정)하지 않는다. 실패·취소는 실제 신호로만.
 * - pendingOAuthProvider = auth mutex (double-submit)
 * - visiblePendingOAuthProvider = 버튼 spinner / "로그인 중…" 만 (native Kakao는 null)
 * - oauthInlineStatus = 1줄 안내 (native Kakao pre-auth는 idle 유지)
 * - email conflict 시 generic 에러 문구 중복 표시 금지 (isNativeProviderEmailConflictError)
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { buildNaverOAuthStartPath } from "@/lib/auth/get-oauth-redirect-url";
import {
  fetchNativeOAuthAuthorizeUrl,
  isOAuthLoginStartSupported,
  startOAuthLogin,
} from "@/lib/auth/oauth/start-oauth-login";
import {
  endOAuthFlow,
  isOAuthFlowInFlight,
  isOAuthInFlightPath,
  NATIVE_OAUTH_BACKGROUND_DETECT_MS,
  NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS,
  releaseOAuthFlowOnUserCancel,
  tryBeginOAuthFlow,
} from "@/lib/auth/oauth/native-oauth-contract";
import { clearStoredLoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { startNativeProviderLogin } from "@/lib/auth/native/start-native-provider-login.client";
import {
  isNativeAppOAuthShell,
  resolveOAuthProviderRoutingSnapshot,
  shouldBlockAppleWebOAuthSafetyNet,
  shouldWaitCapacitorBridgeBeforeOAuthRouting,
} from "@/lib/auth/oauth/oauth-provider-routing.client";
import {
  resolveVisibleOAuthPendingProvider,
  shouldSuppressOAuthPreAuthPresentation,
  shouldSuppressOAuthPreAuthPresentationForRouting,
} from "@/lib/auth/oauth/oauth-pre-auth-presentation";
import {
  isNativeProviderCancelError,
  isNativeProviderEmailConflictError,
  resolveNativeProviderLoginErrorCode,
  summarizeOAuthStartFailure,
} from "@/lib/auth/oauth/oauth-start-error.client";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { OAUTH_COMPLETING_EVENT } from "@/lib/auth/oauth/native-oauth-return-bridge";
import {
  isAuthLoginBusyPhase,
  isAuthLoginCompletingPhase,
  shouldTreatForegroundReturnAsCancel,
  type AuthLoginLaunchKind,
  type AuthLoginPhase,
} from "@/lib/auth/oauth/auth-login-phase";
import {
  beginAuthLifecycleFlow,
  cancelAuthLifecycle,
  failAuthLifecycle,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import { openNativeOAuthTab, isNativeOAuthLauncherCancelError } from "@/lib/auth/oauth/open-native-oauth-tab";
import {
  ensureCapacitorNativeMarkerOnBoot,
  getCapacitorNativeDiagnostics,
  resolveOAuthRoutingShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import type { FinishClientAuthLoginTermsHandoff } from "@/lib/auth/finish-client-auth-login.client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export const OAUTH_PENDING_CLEAR_EVENT = "dibay:oauth-pending-clear";

export type OAuthInlineStatus = "idle" | "preparing" | "opening" | "awaiting_return";

let sharedPendingProvider: OAuthProvider | null = null;
/** When true, mutex is held but CTA must not paint spinner / signing-in label. */
let sharedSuppressVisiblePending = false;
let sharedPhase: AuthLoginPhase = "idle";
let sharedLaunchKind: AuthLoginLaunchKind = null;
let sharedSawHiddenSinceLaunch = false;
const pendingSubscribers = new Set<() => void>();

export type OAuthAuthSuccessInput = FinishClientAuthLoginTermsHandoff & {
  redirectTo?: string | null;
};

type UseOAuthLoginOptions = {
  next?: string | null;
  pendingToken?: string | null;
  onModalClose?: () => void;
  onAuthSuccess?: (input: OAuthAuthSuccessInput) => void | Promise<void>;
};

export function resolveOAuthPendingAfterClear(
  current: OAuthProvider | null,
  _reason: string,
): OAuthProvider | null {
  if (!current) return null;
  return null;
}

function emitPendingChange(): void {
  for (const subscriber of pendingSubscribers) {
    subscriber();
  }
}

function subscribePending(listener: () => void): () => void {
  pendingSubscribers.add(listener);
  return () => {
    pendingSubscribers.delete(listener);
  };
}

function getPendingSnapshot(): OAuthProvider | null {
  return sharedPendingProvider;
}

function getPendingServerSnapshot(): OAuthProvider | null {
  return null;
}

function setSharedPending(
  provider: OAuthProvider | null,
  options?: { suppressVisiblePresentation?: boolean },
): void {
  const nextSuppress =
    provider == null ? false : Boolean(options?.suppressVisiblePresentation);
  const nextPhase: AuthLoginPhase =
    provider == null ? "idle" : sharedPhase === "idle" ? "provider" : sharedPhase;
  if (
    sharedPendingProvider === provider
    && sharedSuppressVisiblePending === nextSuppress
    && sharedPhase === nextPhase
  ) {
    return;
  }
  sharedPendingProvider = provider;
  sharedSuppressVisiblePending = nextSuppress;
  sharedPhase = nextPhase;
  if (provider == null) {
    sharedLaunchKind = null;
    sharedSawHiddenSinceLaunch = false;
  }
  emitPendingChange();
}

function setSharedPhase(phase: AuthLoginPhase): void {
  if (sharedPhase === phase) return;
  sharedPhase = phase;
  if (phase !== "provider") {
    sharedLaunchKind = null;
    sharedSawHiddenSinceLaunch = false;
  }
  emitPendingChange();
}

function setSharedLaunchKind(kind: AuthLoginLaunchKind): void {
  sharedLaunchKind = kind;
  sharedSawHiddenSinceLaunch = false;
}

function getPhaseSnapshot(): AuthLoginPhase {
  return sharedPhase;
}

/** 공급자 인가 코드 복귀(dibay://auth/callback) — 콜드 스타트 포함, 훅 마운트 전에도 단계를 기록한다. */
function markReturnedFromProvider(): void {
  setSharedPhase("returned");
}

if (typeof window !== "undefined") {
  window.addEventListener(OAUTH_COMPLETING_EVENT, markReturnedFromProvider);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && sharedPhase === "provider") {
      sharedSawHiddenSinceLaunch = true;
    }
  });
}

export function getAuthLoginPhaseForTests(): AuthLoginPhase {
  return sharedPhase;
}

export function setAuthLoginPhaseForTests(phase: AuthLoginPhase): void {
  setSharedPhase(phase);
}

function getSuppressVisiblePendingSnapshot(): boolean {
  return sharedSuppressVisiblePending;
}

export function getOAuthPendingSnapshotForTests(): OAuthProvider | null {
  return getPendingSnapshot();
}

export function getOAuthSuppressVisiblePendingForTests(): boolean {
  return getSuppressVisiblePendingSnapshot();
}

export function setOAuthPendingForTests(
  provider: OAuthProvider | null,
  options?: { suppressVisiblePresentation?: boolean },
): void {
  setSharedPending(provider, options);
}

function logAppleLoginPressed(): void {
  const diagnostics = getCapacitorNativeDiagnostics();
  logOAuthNativeEvent("apple_login_pressed", {
    provider: "apple",
    shellPlatform: resolveOAuthRoutingShellPlatform(),
    bridgeReady: diagnostics.bridgeReady,
    nativeAppleLoginAvailable: diagnostics.nativeAppleLoginAvailable,
    hasNativeAppleAuthPluginHeader: diagnostics.hasNativeAppleAuthPluginHeader,
  });
}

function isNaverProvider(provider: OAuthProvider): boolean {
  return provider === "naver";
}

function mapOAuthErrorToMessage(code: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (code === "oauth_flow_in_flight") return t("auth_err_oauth_start_failed");
  if (code === "invalid_provider") return t("auth_err_invalid_provider");
  if (code === "supabase_unconfigured") return t("auth_err_supabase_unconfigured");
  if (code === "oauth_launcher_unavailable") {
    return t("auth_err_oauth_browser_plugin_unavailable");
  }
  if (code === "oauth_launcher_cancelled") {
    return t("auth_err_oauth_start_failed");
  }
  if (
    code === "oauth_tab_open_failed"
    || code === "oauth_custom_tabs_unavailable"
    || code === "oauth_presentation_unavailable"
  ) {
    return t("auth_err_oauth_browser_open_failed");
  }
  if (code === "oauth_bridge_not_ready") return t("auth_err_oauth_bridge_not_ready");
  if (code === "oauth_start_timeout") return t("auth_err_auth_timeout");
  if (code === "navigation_failed") return t("auth_err_oauth_launch_navigation_failed");
  if (code === "user_cancelled") return t("auth_err_oauth_start_failed");
  if (code === "native_exchange_session_unavailable" || code === "auth_completion_failed") {
    return t("auth_err_session_not_persisted");
  }
  if (code === "apple_native_exchange_not_ready") return t("auth_err_apple_native_not_ready");
  if (code === "apple_native_verify_failed") return t("auth_err_apple_native_verify_failed");
  if (code === "apple_native_account_conflict") return t("auth_err_apple_native_account_conflict");
  if (code === "apple_native_invalid_audience") return t("auth_err_apple_native_invalid_audience");
  if (code === "apple_native_config_error" || code === "apple_native_token_missing") {
    return t("auth_err_oauth_start_failed");
  }
  if (code === "apple_native_unavailable") return t("auth_err_apple_native_unavailable");
  if (code === "kakao_native_exchange_not_ready") return t("auth_err_kakao_native_not_ready");
  if (code === "kakao_native_verify_failed") return t("auth_err_kakao_native_verify_failed");
  if (code === "kakao_native_account_conflict") return t("auth_err_kakao_native_account_conflict");
  if (code === "kakao_native_config_error" || code === "kakao_native_token_missing") {
    return t("auth_err_kakao_native_config_error");
  }
  if (code === "kakao_native_key_hash_required") return t("auth_err_kakao_native_key_hash_required");
  if (code === "kakao_native_unavailable") return t("auth_err_kakao_native_unavailable");
  if (code === "google_native_exchange_not_ready") return t("auth_err_google_native_not_ready");
  if (code === "google_native_verify_failed") return t("auth_err_google_native_verify_failed");
  if (code === "google_native_account_conflict") return t("auth_err_google_native_account_conflict");
  if (code === "google_native_config_error" || code === "google_native_token_missing") {
    return t("auth_err_google_native_config_error");
  }
  if (code === "google_native_unavailable") return t("auth_err_google_native_unavailable");
  if (code === "native_provider_not_implemented") return t("auth_err_native_provider_not_implemented");
  return t("auth_err_oauth_start_failed");
}

export function dispatchOAuthPendingClear(reason: string): void {
  endOAuthFlow();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OAUTH_PENDING_CLEAR_EVENT, { detail: { reason } }));
}

/** login 복귀·OAuth 취소 — in-flight lock 즉시 해제 */
export function releaseOAuthFlowAfterUserCancel(reason = "user_cancel"): void {
  releaseOAuthFlowOnUserCancel();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OAUTH_PENDING_CLEAR_EVENT, { detail: { reason } }));
}

async function waitForAppBackground(timeoutMs: number): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let listenerHandle: { remove: () => Promise<void> } | null = null;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        void listenerHandle?.remove();
        fn();
      };
      const timeoutId = window.setTimeout(() => {
        finish(() => reject(new Error("oauth_background_detect_timeout")));
      }, timeoutMs);
      void App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) finish(resolve);
      }).then((handle) => {
        listenerHandle = handle;
      });
    });
  } catch {
    /* web — ignore */
  }
}

export function useOAuthLogin(options: UseOAuthLoginOptions = {}) {
  const { next = null, onAuthSuccess, onModalClose } = options;
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [oauthInlineStatus, setOauthInlineStatus] = useState<OAuthInlineStatus>("idle");
  const pendingOAuthProvider = useSyncExternalStore(
    subscribePending,
    getPendingSnapshot,
    getPendingServerSnapshot,
  );
  const suppressVisiblePending = useSyncExternalStore(
    subscribePending,
    getSuppressVisiblePendingSnapshot,
    () => false,
  );
  const authPhase = useSyncExternalStore(subscribePending, getPhaseSnapshot, () => "idle" as const);
  const visiblePendingOAuthProvider = resolveVisibleOAuthPendingProvider(
    pendingOAuthProvider,
    suppressVisiblePending,
  );
  const mountedRef = useRef(false);
  /** 이 인스턴스가 시작한 흐름이 navigating 에 도달했는지 — 화면 이탈(언마운트) 시 공유 상태를 정리한다. */
  const ownsNavigatingRef = useRef(false);
  const pendingProviderRef = useRef<OAuthProvider | null>(pendingOAuthProvider);
  const suppressVisiblePendingRef = useRef(suppressVisiblePending);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // navigating 의 끝 = 이 화면을 떠남 (router.replace). 다음 로그인 화면이 잠긴 채 남지 않게 정리.
      if (ownsNavigatingRef.current && sharedPhase === "navigating") {
        ownsNavigatingRef.current = false;
        endOAuthFlow();
        setSharedPending(null);
      }
    };
  }, []);

  useEffect(() => {
    pendingProviderRef.current = pendingOAuthProvider;
  }, [pendingOAuthProvider]);

  useEffect(() => {
    suppressVisiblePendingRef.current = suppressVisiblePending;
  }, [suppressVisiblePending]);

  const resetInlineState = useCallback(() => {
    setOauthInlineStatus("idle");
  }, []);

  const clearPending = useCallback(() => {
    endOAuthFlow();
    pendingProviderRef.current = null;
    suppressVisiblePendingRef.current = false;
    setSharedPending(null);
    resetInlineState();
  }, [resetInlineState]);

  /**
   * 공급자 성공 → 서버 확인(confirming) → 이동(navigating).
   * 실패는 throw 로 호출부 catch(handleOAuthStartFailure)가 failed 로 복구한다.
   * 성공 시 pending 을 풀지 않는다 — 풀면 이동 완료 전 로그인 버튼·폼이 다시 보인다.
   * 모달은 completion 이 모달을 닫은 뒤 호스트 화면이 남으므로 그때만 해제한다.
   */
  const completeAuthSuccess = useCallback(
    async (input: OAuthAuthSuccessInput) => {
      clearStoredLoginRequiredDetail();
      suppressVisiblePendingRef.current = false;
      if (pendingProviderRef.current) {
        setSharedPending(pendingProviderRef.current, { suppressVisiblePresentation: false });
      }
      setSharedPhase("confirming");
      setOauthInlineStatus("preparing");
      if (onAuthSuccess) {
        await onAuthSuccess(input);
      }
      if (onModalClose) {
        clearPending();
        return;
      }
      ownsNavigatingRef.current = true;
      setSharedPhase("navigating");
    },
    [clearPending, onAuthSuccess, onModalClose],
  );

  useEffect(() => {
    if (!pendingOAuthProvider && !isAuthLoginBusyPhase(authPhase)) return;

    const handleClear = (event: Event) => {
      const reason =
        event instanceof CustomEvent ? String(event.detail?.reason ?? "manual") : "manual";
      const nextProvider = resolveOAuthPendingAfterClear(pendingProviderRef.current, reason);
      pendingProviderRef.current = nextProvider;
      suppressVisiblePendingRef.current = false;
      setSharedPending(nextProvider);
      if (!nextProvider) {
        resetInlineState();
      }
    };
    window.addEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);

    /**
     * 복귀 이벤트는 「취소」 신호로만 쓴다 (auth-login-phase.shouldTreatForegroundReturnAsCancel).
     * returned·confirming·navigating 중에는 절대 해제하지 않는다.
     */
    const maybeReleaseOnForegroundReturn = (event: Event) => {
      if (document.visibilityState !== "visible") return;
      const pageshowPersisted =
        event.type === "pageshow" && (event as PageTransitionEvent).persisted === true;
      if (isOAuthInFlightPath(window.location.pathname)) return;
      // bfcache 로 되돌아온 화면: 떠나기 전 진행 단계가 남아 있으면 새 상태로 복구.
      if (pageshowPersisted && isAuthLoginCompletingPhase(sharedPhase)) {
        ownsNavigatingRef.current = false;
        clearPending();
        return;
      }
      const treatAsCancel = shouldTreatForegroundReturnAsCancel({
        phase: sharedPhase,
        launchKind: sharedLaunchKind,
        sawHiddenSinceLaunch: sharedSawHiddenSinceLaunch,
        eventType: event.type === "pageshow" ? "pageshow" : "visibilitychange",
        pageshowPersisted,
      });
      if (!treatAsCancel) return;
      releaseOAuthFlowOnUserCancel();
      cancelAuthLifecycle({ reason: "user_returned_without_callback" });
      clearPending();
      if (mountedRef.current) setError(t("auth_oauth_cancelled_notice"));
    };
    document.addEventListener("visibilitychange", maybeReleaseOnForegroundReturn);
    window.addEventListener("pageshow", maybeReleaseOnForegroundReturn);

    return () => {
      window.removeEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);
      document.removeEventListener("visibilitychange", maybeReleaseOnForegroundReturn);
      window.removeEventListener("pageshow", maybeReleaseOnForegroundReturn);
    };
  }, [authPhase, clearPending, pendingOAuthProvider, resetInlineState, t]);

  const handleOAuthStartFailure = useCallback(
    async (err: unknown) => {
      if (
        isNativeProviderCancelError(err)
        || isNativeOAuthLauncherCancelError(err)
        || isNativeProviderEmailConflictError(err)
      ) {
        ownsNavigatingRef.current = false;
        clearPending();
        if (isNativeProviderCancelError(err) || isNativeOAuthLauncherCancelError(err)) {
          releaseOAuthFlowOnUserCancel();
          cancelAuthLifecycle({ reason: "user_cancelled" });
          if (mountedRef.current) setError(t("auth_oauth_cancelled_notice"));
        }
        return;
      }
      ownsNavigatingRef.current = false;
      clearPending();
      const code = resolveNativeProviderLoginErrorCode(err);
      failAuthLifecycle(code, { summary: summarizeOAuthStartFailure(err) });
      console.error("[oauth] oauth_start_failed", summarizeOAuthStartFailure(err));
      if (mountedRef.current) setError(mapOAuthErrorToMessage(code, t));
    },
    [clearPending, t],
  );

  const runCapacitorCustomTabOAuth = useCallback(
    async (provider: OAuthProvider, handoffNext: string | null) => {
      const flow = tryBeginOAuthFlow(provider);
      if (!flow.ok) {
        throw new Error("oauth_flow_in_flight");
      }
      try {
        setOauthInlineStatus("preparing");
        const authorizeUrl = await fetchNativeOAuthAuthorizeUrl(provider, handoffNext);
        setOauthInlineStatus("opening");
        setSharedLaunchKind("custom_tab");
        const launch = await openNativeOAuthTab(authorizeUrl);
        if (launch.callbackDelivered) {
          // ASWebAuth completion already navigated to /auth/callback — do not sit on awaiting_return.
          return;
        }
        try {
          await waitForAppBackground(NATIVE_OAUTH_BACKGROUND_DETECT_MS);
        } catch {
          logOAuthNativeEvent("oauth_inline_background_detect_timeout", { provider });
        }
        setOauthInlineStatus("awaiting_return");
      } catch (err) {
        flow.release();
        throw err;
      }
    },
    [],
  );

  const startOAuthProvider = useCallback(
    (provider: OAuthProvider) => {
      if (pendingProviderRef.current) return;
      if (!isOAuthLoginStartSupported(provider)) return;

      const suppressVisiblePresentation = shouldSuppressOAuthPreAuthPresentation(provider);

      flushSync(() => {
        ensureCapacitorNativeMarkerOnBoot();
        if (mountedRef.current) setError(null);
        pendingProviderRef.current = provider;
        suppressVisiblePendingRef.current = suppressVisiblePresentation;
        setSharedPending(provider, { suppressVisiblePresentation });
        // Native Kakao: keep oauthInlineStatus idle — no "preparing" / signing-in hint paint.
        if (!suppressVisiblePresentation) {
          setOauthInlineStatus("preparing");
        }
      });

      const runProviderStart = async () => {
        beginAuthLifecycleFlow({ provider, flowKind: "oauth_login" });
        markAuthLifecycleStage("login_button_tapped", { route: typeof window !== "undefined" ? window.location.pathname : null });

        if (isNaverProvider(provider)) {
          const flow = tryBeginOAuthFlow(provider);
          if (!flow.ok) {
            clearPending();
            failAuthLifecycle("oauth_flow_in_flight");
            if (mountedRef.current) setError(mapOAuthErrorToMessage("oauth_flow_in_flight", t));
            return;
          }
          try {
            markAuthLifecycleStage("provider_launch_requested", { via: "naver_location_assign" });
            window.location.assign(buildNaverOAuthStartPath(next));
          } catch {
            flow.release();
            await handleOAuthStartFailure(new Error("navigation_failed"));
          }
          return;
        }

        if (shouldWaitCapacitorBridgeBeforeOAuthRouting(provider)) {
          if (!suppressVisiblePendingRef.current) {
            setOauthInlineStatus("preparing");
          }
          await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS });
          ensureCapacitorNativeMarkerOnBoot();
        }

        if (provider === "apple") {
          logAppleLoginPressed();
        }

        const routingSnapshot = resolveOAuthProviderRoutingSnapshot(provider);
        const { shellPlatform, routing, appleWebOAuthFallbackReason } = routingSnapshot;

        // If prediction missed (rare): align suppress flag with resolved native Kakao routing.
        const resolvedSuppress = shouldSuppressOAuthPreAuthPresentationForRouting(
          provider,
          routing.action,
        );
        if (resolvedSuppress !== suppressVisiblePendingRef.current) {
          suppressVisiblePendingRef.current = resolvedSuppress;
          setSharedPending(provider, { suppressVisiblePresentation: resolvedSuppress });
          if (resolvedSuppress) {
            setOauthInlineStatus("idle");
          }
        }

        markAuthLifecycleStage("routing_decision_completed", {
          shellPlatform,
          action: routing.action,
          errorCode: "errorCode" in routing ? routing.errorCode ?? null : null,
          appleWebOAuthFallbackReason: appleWebOAuthFallbackReason ?? null,
        });

        if (provider === "apple") {
          logOAuthNativeEvent("apple_login_routing", {
            provider: "apple",
            shellPlatform,
            action: routing.action,
            reason: appleWebOAuthFallbackReason,
          });
          if (appleWebOAuthFallbackReason) {
            logOAuthNativeEvent("apple_web_oauth_fallback_reason", {
              provider: "apple",
              shellPlatform,
              action: routing.action,
              reason: appleWebOAuthFallbackReason,
            });
          }
        }

        if (routing.action === "native_provider_login") {
          if (!suppressVisiblePendingRef.current) {
            setOauthInlineStatus("opening");
          }
          markAuthLifecycleStage("provider_launch_requested", { via: "native_provider_login" });
          setSharedLaunchKind("native_sdk");
          try {
            const result = await startNativeProviderLogin({ provider, next });
            await completeAuthSuccess(result);
          } catch (err) {
            await handleOAuthStartFailure(err);
          }
          return;
        }

        if (routing.action === "native_blocked") {
          clearPending();
          if (provider === "google") {
            console.error("[oauth] google_native_blocked", getCapacitorNativeDiagnostics());
          }
          if (provider === "apple") {
            logOAuthNativeEvent("apple_native_blocked", {
              provider: "apple",
              shellPlatform,
              action: routing.action,
              errorCode: routing.errorCode,
              reason: routing.webOAuthFallbackReason ?? null,
            });
          }
          failAuthLifecycle(routing.errorCode, {
            stage: "routing_decision_completed",
            action: routing.action,
          });
          if (mountedRef.current) setError(mapOAuthErrorToMessage(routing.errorCode, t));
          return;
        }

        if (shouldBlockAppleWebOAuthSafetyNet(provider, shellPlatform, routing.action)) {
          clearPending();
          logOAuthNativeEvent("apple_native_blocked", {
            provider: "apple",
            shellPlatform,
            action: routing.action,
            errorCode: "apple_native_unavailable",
            reason: "shell_not_detected_before_routing",
          });
          failAuthLifecycle("apple_native_unavailable", {
            reason: "shell_not_detected_before_routing",
          });
          if (mountedRef.current) setError(mapOAuthErrorToMessage("apple_native_unavailable", t));
          return;
        }

        if (routing.action === "web_oauth_start" && isNativeAppOAuthShell()) {
          try {
            markAuthLifecycleStage("provider_launch_requested", { via: "capacitor_custom_tab" });
            await runCapacitorCustomTabOAuth(provider, next);
          } catch (err) {
            await handleOAuthStartFailure(err);
          }
          return;
        }

        try {
          setOauthInlineStatus("opening");
          markAuthLifecycleStage("provider_launch_requested", { via: "web_oauth_start" });
          setSharedLaunchKind("web_redirect");
          startOAuthLogin({ provider, next });
        } catch (err) {
          await handleOAuthStartFailure(err);
        }
      };

      void runProviderStart();
    },
    [
      clearPending,
      completeAuthSuccess,
      handleOAuthStartFailure,
      next,
      runCapacitorCustomTabOAuth,
      t,
    ],
  );

  const clearOAuthError = useCallback(() => {
    if (mountedRef.current) setError(null);
  }, []);

  const resetOAuthOnClose = useCallback(() => {
    if (isOAuthFlowInFlight() || pendingProviderRef.current != null) return;
    if (isAuthLoginBusyPhase(sharedPhase)) return;
    clearPending();
    if (mountedRef.current) setError(null);
  }, [clearPending]);

  return {
    pendingOAuthProvider,
    authPhase,
    /** 버튼·폼 잠금 기준 — 공급자 진행·복귀·서버 확인·이동 중 모두 true */
    authBusy: pendingOAuthProvider != null || isAuthLoginBusyPhase(authPhase),
    /** 로그인 화면 대신 「로그인 중」 화면을 보일 단계 */
    authCompleting: isAuthLoginCompletingPhase(authPhase),
    visiblePendingOAuthProvider,
    oauthInlineStatus,
    oauthError: error,
    startOAuthProvider,
    clearOAuthError,
    resetOAuthOnClose,
  };
}
