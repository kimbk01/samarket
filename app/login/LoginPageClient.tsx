"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { mapProviderToSupabaseOAuth } from "@/lib/auth/login-settings";
import { buildOAuthRedirectUrl } from "@/lib/auth/get-oauth-redirect-url";
import { startGoogleOAuthSignIn } from "@/lib/auth/google-oauth-launch";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { wipeClientSessionState, clearPostLogoutBfcacheGuard } from "@/lib/auth/client-session-wipe";
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { sanitizeNextPath, sanitizeFreshLoginLandingPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
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
const LOGIN_BOOTSTRAP_CACHE_TTL_MS = 30_000;

async function resolvePostAuthDestination(fallback: string): Promise<string> {
  try {
    const { status, json } = await fetchSignupStatusDeduped();
    if (status === 200 && json?.route?.trim()) {
      return json.route.trim();
    }
  } catch {
    /* fallback */
  }
  return fallback;
}

async function navigateAfterFreshLogin(destination: string): Promise<void> {
  await wipeClientSessionState("pre_login_bootstrap", { setPostLogoutGuard: false });
  await ensureAppBoot();
  clearPostLogoutBfcacheGuard();
  const target = await resolvePostAuthDestination(destination);
  window.location.replace(target);
}

function looksLikeEmailForLogin(identifierRaw: string): boolean {
  const s = identifierRaw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type LoginBootstrapSnapshot = {
  providers: AuthProviderPublic[];
  providersError: string | null;
  passwordEnabled: boolean;
  cachedAt: number;
};

let loginBootstrapSnapshot: LoginBootstrapSnapshot | null = null;

function readLoginBootstrapSnapshot(): LoginBootstrapSnapshot | null {
  if (!loginBootstrapSnapshot) return null;
  if (Date.now() - loginBootstrapSnapshot.cachedAt > LOGIN_BOOTSTRAP_CACHE_TTL_MS) return null;
  return loginBootstrapSnapshot;
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
  const postLoginDestination =
    sanitizeFreshLoginLandingPath(next) ?? POST_LOGIN_PATH;
  const [providers, setProviders] = useState<AuthProviderPublic[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordLoginStatus, setPasswordLoginStatus] = useState("");
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  const showLoginError = (message: string, withPopup = false) => {
    setError((prev) => (prev === message ? prev : message));
    if (withPopup && typeof window !== "undefined") window.alert(message);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error")?.trim() ?? "";
    const authErrorDetail = params.get("auth_error_detail")?.trim() ?? "";
    // 스펙 1-A: 콜백/가드가 `?error=session_missing` 을 보낼 수 있다. 동일하게 사용자에게 알린다.
    const errorCode = params.get("error")?.trim() ?? "";
    const code = authError || errorCode;
    if (!code) return;
    const message = mapAuthErrorMessage(code, authErrorDetail, t);
    setError((prev) => (prev === message ? prev : message));
    if (typeof window !== "undefined") window.alert(message);
    // `auth_error`/`error` 만 정리하고 `next` 는 보존해 다음 시도에도 원래 경로로 복귀하게 한다.
    const cleanHref = withNextSearchParam("/login", next ?? null);
    router.replace(cleanHref, { scroll: false });
  }, [router, next, t]);

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
        loginBootstrapSnapshot = {
          providers: nextProviders,
          providersError: nextProvidersError,
          passwordEnabled: nextPasswordEnabled,
          cachedAt: Date.now(),
        };
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
    void (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || !session?.user) return;
        await ensureAppBoot();
        const target = await resolvePostAuthDestination(postLoginDestination);
        if (!cancelled) window.location.assign(target);
      } catch {
        /* 세션 조회 실패 시 로그인 화면 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postLoginDestination]);

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
        showLoginError(t("auth_err_supabase_unconfigured"), true);
        return;
      }
      if (!identifier.trim()) {
        showLoginError(t("auth_err_identifier_required"), true);
        return;
      }
      if (!password) {
        showLoginError(t("auth_err_password_required"), true);
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
            showLoginError(nextError, true);
            return;
          }
          signInEmail = String(resolveJson?.identifier ?? "").trim().toLowerCase();
        } catch (resolveError) {
          const nextError =
            resolveError instanceof DOMException && resolveError.name === "AbortError"
              ? t("auth_err_identifier_resolve_timeout")
              : t("auth_err_login_identifier_lookup_failed");
          showLoginError(nextError, true);
          return;
        }
      }

      if (!signInEmail) {
        showLoginError(t("auth_err_enter_email_or_id_short"), true);
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
          showLoginError(t("auth_err_auth_timeout"), true);
          return;
        }
        showLoginError(mapSupabaseFetchFailureToMessage(describeSupabaseFetchFailure(signInError), t), true);
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
        showLoginError(message, true);
        return;
      }

      const session = signInResult.data.session;
      if (!session) {
        showLoginError(t("auth_err_session_not_persisted"), true);
        return;
      }

      const loginUntilNavT0 = performance.now();

      try {
        await supabase.auth.getSession();
      } catch {
        /* ignore */
      }

      /**
       * 프록시는 Supabase JWT 쿠키만으로 통과한다. `GET /api/me/profile` 은 루트
       * `SupabaseAuthSync` 가 진입 직후 호출해 맞춘다 — 로그인 화면에서 프로필 로드를 기다리지 않는다.
       */
      recordAppWidePhaseLastMs(
        "login_until_navigation_ms",
        Math.round(performance.now() - loginUntilNavT0)
      );
      leaveLoginShellIntact = true;
      await navigateAfterFreshLogin(postLoginDestination);
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
      showLoginError(message, true);
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

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError((prev) => (prev === "" ? prev : ""));
    setOauthBusy((prev) => (prev === provider ? prev : provider));
    try {
      if (provider === "naver") {
        const startUrl = withNextSearchParam("/api/auth/naver/start", next ?? null);
        window.location.assign(startUrl);
        return;
      }
      const supabase = getSupabaseClient();
      if (!supabase) {
        const nextError = t("auth_err_supabase_unconfigured");
        setError((prev) => (prev === nextError ? prev : nextError));
        return;
      }
      // 콜백이 다시 사용할 next 를 redirectTo 에 함께 부착한다.
      const callbackUrl = buildOAuthRedirectUrl(window.location.origin, next ?? null);
      if (provider === "kakao") {
        const { data, error: oauthError } = await withTimeout(
          supabase.auth.signInWithOAuth({
            provider: "kakao",
            options: {
              // Supabase Kakao default scopes include account_email.
              // Force override with queryParams to avoid requesting email on non-business apps.
              queryParams: {
                scope: "profile_nickname profile_image",
              },
              // redirectTo 가 없으면 Supabase 는 현재 페이지(/login)로 ?code= 를 돌려보내 코드 교환이 일어나지 않는다.
              // 반드시 /auth/callback 으로 명시하고 next 도 함께 보존한다.
              redirectTo: callbackUrl,
              skipBrowserRedirect: true,
            },
          }),
          AUTH_REQUEST_TIMEOUT_MS,
          AUTH_REQUEST_TIMEOUT_SIGNAL
        );
        if (oauthError) {
          setError((prev) => (prev === oauthError.message ? prev : oauthError.message));
          return;
        }
        const authorizeUrl = data?.url?.trim() ?? "";
        if (!authorizeUrl) {
          const nextError = t("auth_err_kakao_start_url_failed");
          setError((prev) => (prev === nextError ? prev : nextError));
          return;
        }
        window.location.assign(authorizeUrl);
        return;
      }
      if (provider === "google") {
        const googleResult = await withTimeout(
          startGoogleOAuthSignIn(supabase, callbackUrl),
          AUTH_REQUEST_TIMEOUT_MS,
          AUTH_REQUEST_TIMEOUT_SIGNAL
        );
        if (!googleResult.ok) {
          const nextError =
            googleResult.errorMessage === "missing_authorize_url"
              ? t("auth_err_oauth_authorize_url_failed")
              : googleResult.errorMessage || t("auth_err_oauth_start_failed");
          setError((prev) => (prev === nextError ? prev : nextError));
        }
        return;
      }
      const { data, error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: mapProviderToSupabaseOAuth(provider) as Parameters<typeof supabase.auth.signInWithOAuth>[0]["provider"],
          options: {
            redirectTo: callbackUrl,
            skipBrowserRedirect: true,
          },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_REQUEST_TIMEOUT_SIGNAL
      );
      if (oauthError) {
        const nextError = oauthError.message || t("auth_err_oauth_start_failed");
        setError((prev) => (prev === nextError ? prev : nextError));
        return;
      }
      const authorizeUrl = data?.url?.trim() ?? "";
      if (!authorizeUrl) {
        const nextError = t("auth_err_oauth_authorize_url_failed");
        setError((prev) => (prev === nextError ? prev : nextError));
        return;
      }
      window.location.assign(authorizeUrl);
    } catch (e) {
      if (e instanceof Error && e.message === AUTH_REQUEST_TIMEOUT_SIGNAL) {
        setError((prev) => (prev === t("auth_err_auth_timeout") ? prev : t("auth_err_auth_timeout")));
      } else {
        const nextError = mapSupabaseFetchFailureToMessage(describeSupabaseFetchFailure(e), t);
        setError((prev) => (prev === nextError ? prev : nextError));
      }
    } finally {
      setOauthBusy((prev) => (prev === null ? prev : null));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
        <div className="mx-auto flex justify-center" aria-hidden>
          <DibayAuthLogo size={56} />
        </div>
        <h1 className="mt-3 text-center text-lg font-semibold text-sam-fg">{t("auth_login_title")}</h1>
        <div className="mt-5">
          <LoginProviderButtons
            providers={providers}
            disabled={Boolean(oauthBusy) || loading}
            busyProvider={oauthBusy}
            emptyText={
              providersLoading ? t("auth_sns_providers_loading") : t("auth_sns_providers_none")
            }
            showEmailEntry={passwordEnabled}
            onEmailLoginClick={() => setShowEmailLogin(true)}
            onSelectProvider={(provider) => void handleOAuthLogin(provider)}
          />
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
          <PasswordLoginForm
            identifier={identifier}
            password={password}
            error={error}
            loading={loading}
            loadingText={passwordLoginStatus}
            disabled={loading || Boolean(oauthBusy)}
            className="mt-4 space-y-4"
            onIdentifierChange={setIdentifier}
            onPasswordChange={setPassword}
            onSubmit={handleEmailSubmit}
          />
        ) : error ? (
          <p className="mt-4 sam-text-body-secondary text-red-600">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function LoginPageClient() {
  return <LoginPageContent />;
}
