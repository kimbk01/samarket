"use client";

/**
 * CONTRACT — OAuth login UX (배민·당근 스타일 인라인)
 * - 전체화면 OAuth 로그인 패널·패널 exit 애니메이션 금지
 * - pendingOAuthProvider = 버튼 로딩만, oauthInlineStatus = 1줄 안내
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
  isNativeProviderCancelError,
  isNativeProviderEmailConflictError,
  resolveNativeProviderLoginErrorCode,
  summarizeOAuthStartFailure,
} from "@/lib/auth/oauth/oauth-start-error.client";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  beginAuthLifecycleFlow,
  cancelAuthLifecycle,
  failAuthLifecycle,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import { openNativeOAuthTab } from "@/lib/auth/oauth/open-native-oauth-tab";
import {
  ensureCapacitorNativeMarkerOnBoot,
  getCapacitorNativeDiagnostics,
  isNativeGoogleLoginAvailable,
  resolveOAuthRoutingShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import type { FinishClientAuthLoginTermsHandoff } from "@/lib/auth/finish-client-auth-login.client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export const OAUTH_PENDING_CLEAR_EVENT = "dibay:oauth-pending-clear";
export const OAUTH_PENDING_TIMEOUT_MS = 30_000;

export type OAuthInlineStatus = "idle" | "preparing" | "opening" | "awaiting_return";

let sharedPendingProvider: OAuthProvider | null = null;
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

function setSharedPending(provider: OAuthProvider | null): void {
  if (sharedPendingProvider === provider) return;
  sharedPendingProvider = provider;
  emitPendingChange();
}

export function getOAuthPendingSnapshotForTests(): OAuthProvider | null {
  return getPendingSnapshot();
}

export function setOAuthPendingForTests(provider: OAuthProvider | null): void {
  setSharedPending(provider);
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
  if (code === "oauth_tab_open_failed" || code === "oauth_custom_tabs_unavailable") {
    return t("auth_err_oauth_browser_open_failed");
  }
  if (code === "oauth_bridge_not_ready") return t("auth_err_oauth_bridge_not_ready");
  if (code === "oauth_start_timeout") return t("auth_err_auth_timeout");
  if (code === "navigation_failed") return t("auth_err_oauth_launch_navigation_failed");
  if (code === "user_cancelled") return t("auth_err_oauth_start_failed");
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
  const { next = null, onAuthSuccess } = options;
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [oauthInlineStatus, setOauthInlineStatus] = useState<OAuthInlineStatus>("idle");
  const pendingOAuthProvider = useSyncExternalStore(
    subscribePending,
    getPendingSnapshot,
    getPendingServerSnapshot,
  );
  const mountedRef = useRef(false);
  const pendingProviderRef = useRef<OAuthProvider | null>(pendingOAuthProvider);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    pendingProviderRef.current = pendingOAuthProvider;
  }, [pendingOAuthProvider]);

  const resetInlineState = useCallback(() => {
    setOauthInlineStatus("idle");
  }, []);

  const clearPending = useCallback(() => {
    endOAuthFlow();
    pendingProviderRef.current = null;
    setSharedPending(null);
    resetInlineState();
  }, [resetInlineState]);

  const completeAuthSuccess = useCallback(
    async (input: OAuthAuthSuccessInput) => {
      clearStoredLoginRequiredDetail();
      try {
        if (onAuthSuccess) {
          await onAuthSuccess(input);
        }
      } finally {
        clearPending();
      }
    },
    [clearPending, onAuthSuccess],
  );

  useEffect(() => {
    if (!pendingOAuthProvider) return;

    const timeoutId = window.setTimeout(clearPending, OAUTH_PENDING_TIMEOUT_MS);
    const handleClear = (event: Event) => {
      const reason =
        event instanceof CustomEvent ? String(event.detail?.reason ?? "manual") : "manual";
      const nextProvider = resolveOAuthPendingAfterClear(pendingProviderRef.current, reason);
      pendingProviderRef.current = nextProvider;
      setSharedPending(nextProvider);
      if (!nextProvider) {
        resetInlineState();
      }
    };
    window.addEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);

    const maybeReleaseOnForegroundReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (isOAuthFlowInFlight()) return;
      if (pendingProviderRef.current === "google" && isNativeGoogleLoginAvailable()) return;
      const path = window.location.pathname;
      if (isOAuthInFlightPath(path)) return;
      if (path === "/login" || path === "/signup" || path.startsWith("/login/")) {
        clearPending();
      }
    };
    document.addEventListener("visibilitychange", maybeReleaseOnForegroundReturn);
    window.addEventListener("pageshow", maybeReleaseOnForegroundReturn);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);
      document.removeEventListener("visibilitychange", maybeReleaseOnForegroundReturn);
      window.removeEventListener("pageshow", maybeReleaseOnForegroundReturn);
    };
  }, [clearPending, pendingOAuthProvider, resetInlineState]);

  const handleOAuthStartFailure = useCallback(
    async (err: unknown) => {
      if (isNativeProviderCancelError(err) || isNativeProviderEmailConflictError(err)) {
        if (isNativeProviderCancelError(err)) {
          releaseOAuthFlowOnUserCancel();
          cancelAuthLifecycle({ reason: "user_cancelled" });
        }
        clearPending();
        return;
      }
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
        await openNativeOAuthTab(authorizeUrl);
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

      flushSync(() => {
        ensureCapacitorNativeMarkerOnBoot();
        if (mountedRef.current) setError(null);
        pendingProviderRef.current = provider;
        setSharedPending(provider);
        setOauthInlineStatus("preparing");
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
          setOauthInlineStatus("preparing");
          await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS });
          ensureCapacitorNativeMarkerOnBoot();
        }

        if (provider === "apple") {
          logAppleLoginPressed();
        }

        const routingSnapshot = resolveOAuthProviderRoutingSnapshot(provider);
        const { shellPlatform, routing, appleWebOAuthFallbackReason } = routingSnapshot;

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
          setOauthInlineStatus("opening");
          markAuthLifecycleStage("provider_launch_requested", { via: "native_provider_login" });
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

        if (shouldBlockAppleWebOAuthSafetyNet(shellPlatform, routing.action)) {
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
    clearPending();
    if (mountedRef.current) setError(null);
  }, [clearPending]);

  return {
    pendingOAuthProvider,
    oauthInlineStatus,
    oauthError: error,
    startOAuthProvider,
    clearOAuthError,
    resetOAuthOnClose,
  };
}
