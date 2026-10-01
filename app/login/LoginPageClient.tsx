"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import {
  readLoginBootstrapSnapshot,
  writeLoginBootstrapSnapshot,
} from "@/lib/auth/login-bootstrap-cache";
import { finishClientAuthLogin } from "@/lib/auth/finish-client-auth-login.client";
import { shouldAutoRestoreLoginSessionOnMount } from "@/lib/auth/login-session-auto-restore-policy";
import { sanitizeNextPath, sanitizeFreshLoginLandingPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import type { OAuthAuthSuccessInput } from "@/lib/auth/oauth/use-oauth-login";
import { dispatchOAuthPendingClear, useOAuthLogin } from "@/lib/auth/oauth/use-oauth-login";
import { AuthProviderEmailConflictHost } from "@/components/auth/AuthProviderEmailConflictHost";
import { openProviderEmailConflictFromRedirect } from "@/lib/auth/provider-identity/provider-email-conflict.client";
import type { StoredAuthProvider } from "@/lib/auth/provider-identity/types";
import { OAuthInlineLoginHint } from "@/components/auth/OAuthInlineLoginHint";
import { recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AUTH_IDENTIFIER_RESOLVE_TIMEOUT_SIGNAL,
  AUTH_REQUEST_TIMEOUT_SIGNAL,
  mapAuthErrorMessage,
  mapPasswordLoginErrorMessage,
  mapPasswordResolveErrorCodeToMessage,
  mapSupabaseFetchFailureToMessage,
} from "@/lib/auth/login-error-i18n";

const AUTH_REQUEST_TIMEOUT_MS = 25_000;
const LOGIN_IDENTIFIER_RESOLVE_TIMEOUT_MS = 10_000;

function looksLikeEmailForLogin(identifierRaw: string): boolean {
  const s = identifierRaw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function mapHttpStatusToResolveErrorCode(status: number): string {
  if (status === 429) return "rate_limited";
  return "";
}

function rejectAfter(ms: number, signal: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(signal)), ms);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, signal: string): Promise<T> {
  return Promise.race([p, rejectAfter(ms, signal)]);
}

function LoginPageContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  // `next` 는 SNS 로그인 시작 시 한 번만 캡처. 이후 콜백·세션 복원도 동일 값을 사용한다.
  const next = useMemo(
    () => sanitizeNextPath(searchParams?.get("next") ?? null),
    [searchParams]
  );
  const loginReason = useMemo(
    () => searchParams?.get("reason")?.trim() ?? "",
    [searchParams]
  );
  const openInternalLogin = useMemo(() => {
    const raw = (searchParams?.get("internal") ?? searchParams?.get("ops") ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  }, [searchParams]);
  const blockedFromLogoutLandingRef = useRef(loginReason === "logout");
  const postLoginDestination =
    sanitizeFreshLoginLandingPath(next) ?? POST_LOGIN_PATH;
  const [providers, setProviders] = useState<AuthProviderPublic[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const handleAuthSuccess = useCallback(
    async (input: OAuthAuthSuccessInput) => {
      await finishClientAuthLogin({
        redirectTo: input.redirectTo,
        next: next ?? null,
        needsTermsAgreement: input.needsTermsAgreement,
        consentComplete: input.consentComplete,
        signupComplete: input.signupComplete,
        // Slice 6-7: preserve Native Thin Handoff client-sync flag (do not drop).
        syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
        router,
      });
    },
    [next, router],
  );
  const {
    pendingOAuthProvider,
    oauthInlineStatus,
    oauthError,
    startOAuthProvider,
  } = useOAuthLogin({
    next: next ?? null,
    onAuthSuccess: handleAuthSuccess,
  });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordLoginStatus, setPasswordLoginStatus] = useState("");
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  useEffect(() => {
    if (openInternalLogin) {
      setShowEmailLogin(true);
    }
  }, [openInternalLogin]);

  const showLoginError = (message: string) => {
    setError((prev) => (prev === message ? prev : message));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loginReason && window.location.search.length === 0) return;
    if (loginReason === "session_expired") {
      const message = t("auth_session_expired_notice");
      setError((prev) => (prev === message ? prev : message));
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    if (loginReason === "auth_required") {
      const message = t("auth_login_required_notice");
      setError((prev) => (prev === message ? prev : message));
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    if (loginReason === "logout") {
      blockedFromLogoutLandingRef.current = true;
      const message = t("auth_logout_success_notice");
      setError((prev) => (prev === message ? prev : message));
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error")?.trim() ?? "";
    const authErrorDetail = params.get("auth_error_detail")?.trim() ?? "";
    const errorCode = params.get("error")?.trim() ?? "";
    const code = authError || errorCode;

    const stash = params.get("auth_stash")?.trim() ?? "";
    const conflictEmail = params.get("auth_conflict_email")?.trim() ?? "";
    const attempted = params.get("auth_conflict_attempted")?.trim() ?? "";
    const existingRaw = params.get("auth_conflict_existing")?.trim() ?? "";
    if (stash && conflictEmail && attempted) {
      const existingProviders = existingRaw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean) as StoredAuthProvider[];
      openProviderEmailConflictFromRedirect({
        email: conflictEmail,
        attemptedProvider: attempted as "google" | "kakao" | "apple",
        existingProviders,
        stashToken: stash,
      });
      dispatchOAuthPendingClear("provider_email_conflict");
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }

    if (!code) return;
    dispatchOAuthPendingClear("exchange_failed");
    const message =
      code === "oauth_start_failed" || code === "missing_authorize_url"
        ? t("auth_err_oauth_start_failed")
        : mapAuthErrorMessage(code, authErrorDetail, t);
    setError((prev) => (prev === message ? prev : message));
    // `auth_error`/`error` 만 정리하고 `next` 는 보존해 다음 시도에도 원래 경로로 복귀하게 한다.
    const cleanHref = withNextSearchParam("/login", next ?? null);
    router.replace(cleanHref, { scroll: false });
  }, [router, next, t, loginReason]);

  useEffect(() => {
    let cancelled = false;
    const cached = readLoginBootstrapSnapshot();
    if (cached) {
      setProviders((prev) => (prev === cached.providers ? prev : cached.providers));
      setProvidersError((prev) => (prev === cached.providersError ? prev : cached.providersError));
      setPasswordEnabled((prev) => (prev === cached.passwordEnabled ? prev : cached.passwordEnabled));
      setProvidersLoading((prev) => (prev ? false : prev));
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      setProvidersLoading((prev) => (prev ? prev : true));
      setProvidersError((prev) => (prev === null ? prev : null));
      let nextProviders: AuthProviderPublic[] = [];
      let nextProvidersError: string | null = null;
      let nextPasswordEnabled = true;
      try {
        const [providersRes, settingsRes] = await Promise.all([
          runSingleFlight("login:auth-providers:enabled:get", () =>
            fetch("/api/auth-providers?enabled=true", {
              credentials: "include",
              cache: "no-store",
            })
          ),
          runSingleFlight("login:auth-login-settings:get", () =>
            fetch("/api/auth/login-settings", {
              credentials: "include",
              cache: "no-store",
            })
          ),
        ]);
        const providersJson = (await providersRes.clone().json().catch(() => null)) as
          | { ok?: boolean; providers?: AuthProviderPublic[]; error?: string }
          | null;
        if (!providersRes.ok || !providersJson?.ok || !Array.isArray(providersJson.providers)) {
          nextProvidersError = providersJson?.error || t("auth_sns_providers_load_failed");
        } else {
          nextProviders = providersJson.providers;
        }
        const settingsJson = (await settingsRes.clone().json().catch(() => null)) as
          | { ok?: boolean; settings?: Array<{ provider?: string; enabled?: boolean }> }
          | null;
        if (settingsRes.ok && settingsJson?.ok && Array.isArray(settingsJson.settings)) {
          const passwordSetting = settingsJson.settings.find((item) => item.provider === "password");
          if (passwordSetting) {
            nextPasswordEnabled = passwordSetting.enabled === true;
          }
        }
      } catch {
        nextProvidersError = t("auth_sns_providers_load_failed");
      } finally {
        if (cancelled) return;
        setProviders((prev) => {
          if (
            prev.length === nextProviders.length &&
            prev.every((p, i) => {
              const next = nextProviders[i];
              return (
                next != null &&
                p.provider === next.provider &&
                p.enabled === next.enabled &&
                p.client_id === next.client_id &&
                p.redirect_uri === next.redirect_uri &&
                p.scope === next.scope &&
                p.sort_order === next.sort_order
              );
            })
          ) {
            return prev;
          }
          return nextProviders;
        });
        setProvidersError((prev) => (prev === nextProvidersError ? prev : nextProvidersError));
        setPasswordEnabled((prev) => (prev === nextPasswordEnabled ? prev : nextPasswordEnabled));
        writeLoginBootstrapSnapshot({
          providers: nextProviders,
          providersError: nextProvidersError,
          passwordEnabled: nextPasswordEnabled,
          cachedAt: Date.now(),
        });
        setProvidersLoading((prev) => (prev ? false : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    void router.prefetch(postLoginDestination);
  }, [router, postLoginDestination]);

  useEffect(() => {
    let cancelled = false;
    if (
      !shouldAutoRestoreLoginSessionOnMount(loginReason, blockedFromLogoutLandingRef.current)
    ) {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || !session?.user) return;
        await finishClientAuthLogin({
          redirectTo: postLoginDestination,
          next: next ?? null,
          router,
        });
      } catch {
        /* 세션 조회 실패 시 로그인 화면 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loginReason, next, postLoginDestination, router]);

  const oauthEnabled = providers.length > 0;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    /**
     * 이중 제출 가드: input은 disabled 상태지만 PasswordManager 자동입력·
     * Enter 연속 입력으로 form.onSubmit이 다시 호출될 수 있다.
     */
    if (loading) return;
    setError((prev) => (prev === "" ? prev : ""));
    setLoading(true);
    setPasswordLoginStatus(t("auth_status_checking"));
    /** 전체 이동 직전에는 finally 에서 로딩을 풀지 않음 — 폼이 잠깐 다시 보이는 현상 방지 */
    let leaveLoginShellIntact = false;

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        showLoginError(t("auth_err_supabase_unconfigured"));
        return;
      }
      if (!identifier.trim()) {
        showLoginError(t("auth_err_identifier_required"));
        return;
      }
      if (!password) {
        showLoginError(t("auth_err_password_required"));
        return;
      }

      let signInEmail = "";
      if (looksLikeEmailForLogin(identifier)) {
        signInEmail = identifier.trim().toLowerCase();
      } else {
        try {
          const resolveRes = await runSingleFlight(
            `login:password-resolve-identifier:${identifier.trim().toLowerCase()}`,
            () =>
              fetchWithTimeout("/api/auth/password-login/resolve-identifier", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ identifier }),
                timeoutMs: LOGIN_IDENTIFIER_RESOLVE_TIMEOUT_MS,
              })
          );
          const resolveJson = (await resolveRes.json().catch(() => null)) as
            | { identifier?: string; error?: string; code?: string }
            | null;
          if (!resolveRes.ok) {
            const fallbackError = mapPasswordLoginErrorMessage(
              resolveJson?.error ?? t("auth_err_login_identifier_lookup_failed"),
              t
            );
            const codeFromBody = String(resolveJson?.code ?? "").trim();
            const codeFromStatus = mapHttpStatusToResolveErrorCode(resolveRes.status);
            const code = codeFromBody || codeFromStatus;
            const nextError = mapPasswordResolveErrorCodeToMessage(code, fallbackError, t);
            showLoginError(nextError);
            return;
          }
          signInEmail = String(resolveJson?.identifier ?? "").trim().toLowerCase();
        } catch (resolveError) {
          const nextError =
            resolveError instanceof DOMException && resolveError.name === "AbortError"
              ? t("auth_err_identifier_resolve_timeout")
              : t("auth_err_login_identifier_lookup_failed");
          showLoginError(nextError);
          return;
        }
      }

      if (!signInEmail) {
        showLoginError(t("auth_err_enter_email_or_id_short"));
        return;
      }

      setPasswordLoginStatus(t("auth_status_navigating"));
      let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
      try {
        signInResult = await withTimeout(
          supabase.auth.signInWithPassword({ email: signInEmail, password }),
          AUTH_REQUEST_TIMEOUT_MS,
          AUTH_REQUEST_TIMEOUT_SIGNAL
        );
      } catch (signInError) {
        if (signInError instanceof Error && signInError.message === AUTH_REQUEST_TIMEOUT_SIGNAL) {
          showLoginError(t("auth_err_auth_timeout"));
          return;
        }
        showLoginError(mapSupabaseFetchFailureToMessage(describeSupabaseFetchFailure(signInError), t));
        return;
      }

      const err = signInResult.error;
      if (err) {
        const net = describeSupabaseFetchFailure(err);
        const normalizedRaw = String(err.message ?? "").trim().toLowerCase();
        let message =
          net.code !== "unknown"
            ? mapSupabaseFetchFailureToMessage(net, t)
            : mapPasswordLoginErrorMessage(err.message || t("auth_err_login_failed"), t);
        if (normalizedRaw.includes("invalid login credentials")) {
          message = identifier.includes("@")
            ? t("auth_err_wrong_password_email")
            : t("auth_err_wrong_password");
        }
        showLoginError(message);
        return;
      }

      const session = signInResult.data.session;
      if (!session) {
        showLoginError(t("auth_err_session_not_persisted"));
        return;
      }

      const loginUntilNavT0 = performance.now();

      void supabase.auth.getSession().catch(() => {
        /* ignore */
      });

      /**
       * 프록시는 Supabase JWT 쿠키만으로 통과한다. `GET /api/me/profile` 은 루트
       * `SupabaseAuthSync` 가 진입 직후 호출해 맞춘다 — 로그인 화면에서 프로필 로드를 기다리지 않는다.
       */
      recordAppWidePhaseLastMs(
        "login_until_navigation_ms",
        Math.round(performance.now() - loginUntilNavT0)
      );
      leaveLoginShellIntact = true;
      await finishClientAuthLogin({
        next: next ?? null,
        router,
      });
      return;
    } catch (unexpected) {
      /**
       * 어떤 예외가 나도 cleanup이 finally에서 보장되도록 최후 안전망.
       * 사용자에게는 명확히 알리고 콘솔로 진단 흔적을 남긴다.
       */
      const message =
        unexpected instanceof Error && unexpected.message
          ? t("auth_err_login_unexpected", { message: unexpected.message })
          : t("auth_err_login_unknown");
      showLoginError(message);
      if (typeof console !== "undefined") {
        console.error("[samarket:login] unexpected handleEmailSubmit failure", unexpected);
      }
    } finally {
      if (!leaveLoginShellIntact) {
        setLoading(false);
        setPasswordLoginStatus((prev) => (prev === "" ? prev : ""));
      }
    }
  };

  const handleOAuthLogin = (provider: OAuthProvider) => {
    void startOAuthProvider(provider);
  };

  const displayError = error || oauthError || "";

  return (
    <>
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
        <div className="mx-auto flex justify-center" aria-hidden>
          <DibayAuthLogo size={56} />
        </div>
        <h1 className="mt-3 text-center text-lg font-semibold text-sam-fg">{t("auth_login_title")}</h1>
        <div className="mt-5">
          <LoginProviderButtons
            providers={providers}
            disabled={loading}
            pendingOAuthProvider={pendingOAuthProvider}
            emptyText={
              providersLoading ? t("auth_sns_providers_loading") : t("auth_sns_providers_none")
            }
            showEmailEntry={passwordEnabled && !showEmailLogin}
            onEmailLoginClick={() => setShowEmailLogin(true)}
            onSelectProvider={(provider) => void handleOAuthLogin(provider)}
          />
          <OAuthInlineLoginHint status={oauthInlineStatus} className="mt-3" />
        </div>
        {providersError ? (
          <p className="mt-4 sam-text-body-secondary text-red-600">{providersError}</p>
        ) : null}
        {!passwordEnabled && !oauthEnabled && !providersError ? (
          <p className="mt-4 sam-text-body-secondary text-amber-700">
            {t("auth_no_login_methods")}
          </p>
        ) : null}
        {passwordEnabled && showEmailLogin ? (
          <div className="mt-4" data-auth-surface="internal" data-testid="auth-internal-login-panel">
            <p className="sam-text-body-secondary text-[#667085]">
              {t("auth_login_internal_hint")}
            </p>
            <PasswordLoginForm
              identifier={identifier}
              password={password}
              error={displayError}
              loading={loading}
              loadingText={passwordLoginStatus}
              disabled={loading || pendingOAuthProvider != null}
              className="mt-2 space-y-4"
              onIdentifierChange={setIdentifier}
              onPasswordChange={setPassword}
              onSubmit={handleEmailSubmit}
            />
          </div>
        ) : displayError ? (
          <p className="mt-4 sam-text-body-secondary text-red-600">{displayError}</p>
        ) : null}
      </div>
      </div>
      <AuthProviderEmailConflictHost />
    </>
  );
}

export default function LoginPageClient() {
  return <LoginPageContent />;
}
