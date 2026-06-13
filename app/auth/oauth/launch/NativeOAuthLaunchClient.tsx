"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { openNativeOAuthTab } from "@/lib/auth/oauth/open-native-oauth-tab";
import { fetchNativeOAuthAuthorizeUrl } from "@/lib/auth/oauth/start-oauth-login";
import { ensureCapacitorNativeMarkerOnBoot, isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH = new Set<OAuthProvider>(["google", "kakao", "apple"]);
const OAUTH_TAB_OPEN_TIMEOUT_MS = 12_000;

function parseProvider(value: string | null): OAuthProvider | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return SUPABASE_OAUTH.has(normalized as OAuthProvider) ? (normalized as OAuthProvider) : null;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureCapacitorNativeMarkerOnBoot();
    if (!isCapacitorNativePlatform()) {
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

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = await fetchNativeOAuthAuthorizeUrl(provider, next);
        if (!cancelled) setAuthorizeUrl(url);
      } catch (err) {
        if (!cancelled) {
          const code = err instanceof Error ? err.name : "oauth_start_failed";
          if (code === "oauth_start_timeout") {
            setError(t("auth_err_auth_timeout"));
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
    if (!isCapacitorNativePlatform()) return;
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) setOpening(false);
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  const handleOpenBrowser = useCallback(() => {
    if (!authorizeUrl || opening) return;
    setOpening(true);
    setError(null);

    let timeoutId: number | undefined;
    void (async () => {
      try {
        await Promise.race([
          openNativeOAuthTab(authorizeUrl),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error("browser_open_timeout")),
              OAUTH_TAB_OPEN_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (err) {
        const code = err instanceof Error ? err.message : "browser_open_rejected";
        if (code === "browser_open_timeout") {
          setError(t("auth_err_oauth_browser_open_failed"));
        } else {
          setError(t("auth_err_oauth_browser_open_failed"));
        }
        setOpening(false);
      } finally {
        if (timeoutId != null) window.clearTimeout(timeoutId);
      }
    })();
  }, [authorizeUrl, opening, t]);

  const handleBack = useCallback(() => {
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
            : safeT("auth_oauth_launch_body", {
                fallbackKo: "아래 버튼을 눌러 로그인 창을 열어 주세요.",
                fallbackEn: "Tap the button below to open the sign-in window.",
              })}
        </p>

        <button
          type="button"
          disabled={loading || opening || !authorizeUrl}
          className={`${OAUTH_LOGIN_PRIMARY_BUTTON_BASE} ${style?.buttonClassName ?? ""}`}
          onClick={handleOpenBrowser}
        >
          <OAuthLoginProviderIcon provider={provider} size="primary" />
          <span className={style?.labelClassName ?? "text-sam-fg"}>
            {opening ? t("auth_oauth_redirecting_label") : label}
          </span>
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button type="button" className="text-sm text-sam-muted underline" onClick={handleBack}>
          {backLabel}
        </button>
      </div>
    </main>
  );
}
