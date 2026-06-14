"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App } from "@capacitor/app";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getOAuthLoginContinueLabelKey,
  getOAuthLoginPrimaryStyle,
  OAUTH_LOGIN_PRIMARY_BUTTON_BASE,
  OAuthLoginProviderIcon,
} from "@/components/auth/OAuthLoginProviderVisuals";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  NATIVE_OAUTH_BACKGROUND_DETECT_MS,
  NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS,
} from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  formatNativeOAuthDevError,
  mapNativeOAuthOpenErrorToMessageKey,
  openNativeOAuthTab,
} from "@/lib/auth/oauth/open-native-oauth-tab";
import { fetchNativeOAuthAuthorizeUrl } from "@/lib/auth/oauth/start-oauth-login";
import { dispatchOAuthPendingClear } from "@/lib/auth/oauth/use-oauth-login";
import { resolveOAuthNativeRoutingDecision } from "@/lib/auth/oauth/oauth-native-routing";
import { shouldBlockLegacyOAuthOnNativeApp } from "@/lib/auth/native/native-provider-contract";
import {
  ensureCapacitorNativeMarkerOnBoot,
  getCapacitorNativeDiagnostics,
  isCapacitorBridgeReady,
  isOAuthNativeLaunchShell,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH = new Set<OAuthProvider>(["google", "kakao", "apple"]);

export { NATIVE_OAUTH_BACKGROUND_DETECT_MS as OAUTH_BACKGROUND_WAIT_MS };

function parseProvider(value: string | null): OAuthProvider | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return SUPABASE_OAUTH.has(normalized as OAuthProvider) ? (normalized as OAuthProvider) : null;
}

function formatBridgeDiagnosticsForDev(): string {
  const diagnostics = getCapacitorNativeDiagnostics();
  return [
    `hasAndroidBridge=${diagnostics.hasAndroidBridge}`,
    `platform=${diagnostics.platform ?? "null"}`,
    `pluginHeader=${diagnostics.hasNativeOAuthLauncherPluginHeader}`,
    `dibay_app=${diagnostics.dibayAppPlatformMarker ?? "null"}`,
    `href=${diagnostics.locationHref ?? "null"}`,
    `bridgeReady=${diagnostics.bridgeReady}`,
  ].join(" | ");
}

function waitForAppBackground(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
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
      if (!isActive) {
        finish(resolve);
      }
    }).then((handle) => {
      listenerHandle = handle;
    });
  });
}

export function NativeOAuthLaunchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, safeT } = useI18n();
  const provider = useMemo(
    () => parseProvider(searchParams.get("provider")),
    [searchParams],
  );
  const next = searchParams.get("next");

  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const openStartedRef = useRef(false);

  useEffect(() => {
    ensureCapacitorNativeMarkerOnBoot();
    logOAuthNativeEvent("launch_client_mount", getCapacitorNativeDiagnostics());

    if (!isOAuthNativeLaunchShell()) {
      logOAuthNativeEvent("launch_client_not_native_redirect");
      router.replace("/login");
      return;
    }
    if (!provider) {
      setError(safeT("auth_err_invalid_provider", {
        fallbackKo: "지원하지 않는 로그인 방식입니다.",
        fallbackEn: "This sign-in method is not supported.",
      }));
      setLoading(false);
      return;
    }

    if (shouldBlockLegacyOAuthOnNativeApp(provider, true)) {
      const routing = resolveOAuthNativeRoutingDecision({
        provider,
        isNativeAppShell: true,
      });
      if (routing.action !== "web_oauth_start") {
        logOAuthNativeEvent("launch_client_native_provider_blocked", {
          provider,
          action: routing.action,
          errorCode: routing.action === "native_blocked" ? routing.errorCode : null,
        });
        dispatchOAuthPendingClear("launch_legacy_oauth_blocked");
        router.replace("/login");
        return;
      }
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const ready = isCapacitorBridgeReady()
          || await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS });
        if (!ready) {
          throw new Error("oauth_bridge_not_ready");
        }
        if (cancelled) return;
        setBridgeReady(true);

        const url = await fetchNativeOAuthAuthorizeUrl(provider, next);
        logOAuthNativeEvent("launch_fetch_authorize_ok", { urlLen: url.length });
        if (!cancelled) setAuthorizeUrl(url);
      } catch (err) {
        logOAuthNativeEvent("launch_fetch_authorize_throw", {
          code: err instanceof Error ? err.name : "oauth_start_failed",
        });
        if (!cancelled) {
          const code = err instanceof Error ? err.name : "oauth_start_failed";
          if (code === "oauth_start_timeout") {
            setError(t("auth_err_auth_timeout"));
          } else if (code === "oauth_bridge_not_ready") {
            setError(safeT("auth_err_oauth_bridge_not_ready", {
              fallbackKo: "앱 로그인 연결이 준비되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.",
              fallbackEn: "App sign-in is not connected yet. Fully close the app and open it again.",
            }));
            setDevError(formatBridgeDiagnosticsForDev());
          } else if (code === "oauth_native_redirect_mismatch") {
            setError(safeT("auth_err_oauth_start_failed", {
              fallbackKo: "앱 로그인 주소가 올바르지 않습니다. Supabase Redirect URLs에 https://samarket.vercel.app/** 가 등록되어 있는지 확인해 주세요.",
              fallbackEn: "App sign-in redirect is misconfigured. Check Supabase Redirect URLs include https://samarket.vercel.app/**.",
            }));
          } else {
            setError(t("auth_err_oauth_start_failed"));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [next, provider, router, safeT, t]);

  useEffect(() => {
    if (!isOAuthNativeLaunchShell()) return;
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        setOpening(false);
      }
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  const resolveOpenErrorMessage = useCallback(
    (err: unknown): string => {
      if (err instanceof Error) {
        const code = err.name || "oauth_tab_open_failed";
        return t(mapNativeOAuthOpenErrorToMessageKey(code));
      }
      return t("auth_err_oauth_browser_open_failed");
    },
    [t],
  );

  const runNativeOAuthOpen = useCallback(async (url: string) => {
    if (!bridgeReady) {
      const readyNow = isCapacitorBridgeReady()
        || await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS });
      setBridgeReady(readyNow);
      if (!readyNow) {
        dispatchOAuthPendingClear("oauth_launch_bridge_timeout");
        setError(safeT("auth_err_oauth_bridge_not_ready", {
          fallbackKo: "앱 로그인 연결이 준비되지 않았습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.",
          fallbackEn: "App sign-in is not connected yet. Fully close the app and open it again.",
        }));
        setDevError(formatBridgeDiagnosticsForDev());
        return;
      }
    }

    setOpening(true);
    setError(null);
    setDevError(null);

    try {
      const launchResult = await openNativeOAuthTab(url);
      logOAuthNativeEvent("launch_after_open", { method: launchResult.method });
      try {
        await waitForAppBackground(NATIVE_OAUTH_BACKGROUND_DETECT_MS);
      } catch {
        logOAuthNativeEvent("launch_background_detect_timeout", {
          note: "Custom Tab may still be open; callback is authoritative.",
        });
      }
    } catch (err) {
      logOAuthNativeEvent("launch_open_throw", {
        code: err instanceof Error ? err.name : "oauth_tab_open_failed",
      });
      dispatchOAuthPendingClear("oauth_launch_open_failed");
      setError(resolveOpenErrorMessage(err));
      setDevError(formatNativeOAuthDevError(err) ?? formatBridgeDiagnosticsForDev());
      setOpening(false);
    }
  }, [bridgeReady, resolveOpenErrorMessage, safeT]);

  useEffect(() => {
    if (!authorizeUrl || loading || opening || !bridgeReady || openStartedRef.current) return;
    openStartedRef.current = true;
    logOAuthNativeEvent("launch_auto_open_start", getCapacitorNativeDiagnostics());
    void runNativeOAuthOpen(authorizeUrl);
  }, [authorizeUrl, bridgeReady, loading, opening, runNativeOAuthOpen]);

  const handleOpenBrowser = useCallback(() => {
    if (!authorizeUrl || opening) return;
    openStartedRef.current = true;
    void runNativeOAuthOpen(authorizeUrl);
  }, [authorizeUrl, opening, runNativeOAuthOpen]);

  const handleBack = useCallback(() => {
    dispatchOAuthPendingClear("oauth_launch_back");
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/login");
  }, [router]);

  const backLabel = safeT("auth_oauth_launch_back", {
    fallbackKo: "돌아가기",
    fallbackEn: "Go back",
  });

  if (!provider) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-sam-app px-6">
        <p className="text-center text-sm text-red-600">{error}</p>
        <button type="button" className="mt-4 text-sm text-sam-muted underline" onClick={handleBack}>
          {backLabel}
        </button>
      </main>
    );
  }

  const label = t(getOAuthLoginContinueLabelKey(provider));
  const style = getOAuthLoginPrimaryStyle(provider);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-sam-app px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <OAuthLoginProviderIcon provider={provider} size="primary" />
        </div>
        <h1 className="text-lg font-semibold text-sam-fg">
          {safeT("auth_oauth_launch_title", {
            fallbackKo: "로그인 계속",
            fallbackEn: "Continue sign-in",
          })}
        </h1>
        <p className="text-sm text-sam-muted">
          {loading
            ? safeT("auth_oauth_launch_preparing", {
                fallbackKo: "로그인 준비 중…",
                fallbackEn: "Preparing sign-in…",
              })
            : !bridgeReady
              ? safeT("auth_oauth_launch_bridge_preparing", {
                  fallbackKo: "앱 연결 준비 중…",
                  fallbackEn: "Connecting to the app…",
                })
              : safeT("auth_oauth_launch_body", {
                  fallbackKo: "아래 버튼을 눌러 로그인 창을 열어 주세요.",
                  fallbackEn: "Tap the button below to open the sign-in window.",
                })}
        </p>

        <button
          type="button"
          disabled={loading || opening || !authorizeUrl || !bridgeReady}
          className={`${OAUTH_LOGIN_PRIMARY_BUTTON_BASE} ${style?.buttonClassName ?? ""}`}
          onClick={handleOpenBrowser}
        >
          <OAuthLoginProviderIcon provider={provider} size="primary" />
          <span className={style?.labelClassName ?? "text-sam-fg"}>
            {opening ? t("auth_oauth_redirecting_label") : label}
          </span>
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {devError ? <p className="text-xs text-sam-muted break-all">{devError}</p> : null}

        <button type="button" className="text-sm text-sam-muted underline" onClick={handleBack}>
          {backLabel}
        </button>
      </div>
    </main>
  );
}
