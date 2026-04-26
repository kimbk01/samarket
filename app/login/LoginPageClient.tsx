"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { mapProviderToSupabaseOAuth } from "@/lib/auth/login-settings";
import { buildOAuthRedirectUrl } from "@/lib/auth/get-oauth-redirect-url";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import { recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfileEnsureDeduped } from "@/lib/profile/ensure-profile-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const AUTH_REQUEST_TIMEOUT_MS = 25_000;
const LOGIN_ENSURE_SOFT_WAIT_MS = 0;
const AUTH_TIMEOUT_MESSAGE =
  "인증 서버(Supabase) 응답이 지연되거나 없습니다. 인터넷·VPN·방화벽을 확인하고, .env의 URL·anon 키가 대시보드와 일치하는지 확인한 뒤 다시 시도해 주세요.";

function mapAuthErrorMessage(code: string): string {
  if (!code) return "로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.";
  if (code === "provider_not_enabled") return "선택한 로그인 제공자가 비활성화되어 있습니다.";
  if (code === "provider_key_missing") return "로그인 제공자 키가 누락되어 있습니다. 관리자에게 문의해 주세요.";
  if (code === "redirect_uri_not_allowed") return "허용되지 않은 Redirect URI입니다.";
  if (code === "callback_failed") return "OAuth 콜백 처리에 실패했습니다. 다시 시도해 주세요.";
  if (code === "profile_ensure_failed") return "프로필 동기화에 실패했습니다. 다시 로그인해 주세요.";
  if (code === "session_sync_failed") return "세션 동기화에 실패했습니다. 다시 로그인해 주세요.";
  if (code === "user_not_found") return "로그인 사용자를 확인하지 못했습니다. 다시 시도해 주세요.";
  if (code === "invalid_provider") return "로그인 제공자 정보가 올바르지 않습니다.";
  if (code === "provider_mismatch") return "로그인 제공자 정보가 일치하지 않습니다.";
  if (code === "missing_code") return "로그인 인증 코드가 누락되었습니다.";
  if (code === "provider_id_missing") return "로그인 사용자 식별자를 찾지 못했습니다.";
  if (code === "user_upsert_failed") return "회원 가입 처리에 실패했습니다. 다시 시도해 주세요.";
  if (code === "supabase_service_unconfigured") return "서버 인증 설정이 누락되었습니다. 관리자에게 문의해 주세요.";
  if (code === "session_missing") return "세션이 만료되었거나 확인되지 않아 다시 로그인해 주세요.";
  return `로그인 처리 실패(${code}). 다시 시도해 주세요.`;
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, rejectAfter(ms, message)]);
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `next` 는 SNS 로그인 시작 시 한 번만 캡처. 이후 콜백·세션 복원도 동일 값을 사용한다.
  const next = useMemo(
    () => sanitizeNextPath(searchParams?.get("next") ?? null),
    [searchParams]
  );
  const postLoginDestination = next ?? POST_LOGIN_PATH;
  const [providers, setProviders] = useState<AuthProviderPublic[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error")?.trim() ?? "";
    // 스펙 1-A: 콜백/가드가 `?error=session_missing` 을 보낼 수 있다. 동일하게 사용자에게 알린다.
    const errorCode = params.get("error")?.trim() ?? "";
    const code = authError || errorCode;
    if (!code) return;
    const message = mapAuthErrorMessage(code);
    setError((prev) => (prev === message ? prev : message));
    if (typeof window !== "undefined") window.alert(message);
    // `auth_error`/`error` 만 정리하고 `next` 는 보존해 다음 시도에도 원래 경로로 복귀하게 한다.
    const cleanHref = withNextSearchParam("/login", next ?? null);
    router.replace(cleanHref, { scroll: false });
  }, [router, next]);

  useEffect(() => {
    void (async () => {
      setProvidersLoading((prev) => (prev ? prev : true));
      setProvidersError((prev) => (prev === null ? prev : null));
      try {
        const res = await runSingleFlight("login:auth-providers:enabled:get", () =>
          fetch("/api/auth-providers?enabled=true", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.clone().json().catch(() => null)) as
          | { ok?: boolean; providers?: AuthProviderPublic[]; error?: string }
          | null;
        if (!res.ok || !json?.ok || !Array.isArray(json.providers)) {
          const nextProviderError = json?.error || "SNS 로그인 목록을 불러오지 못했습니다.";
          setProvidersError((prev) => (prev === nextProviderError ? prev : nextProviderError));
          return;
        }
        const providersFromApi = json.providers;
        setProviders((prev) => {
          if (
            prev.length === providersFromApi.length &&
            prev.every((p, i) => {
              const next = providersFromApi[i];
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
          return providersFromApi;
        });
      } catch {
        const nextProviderError = "SNS 로그인 목록을 불러오지 못했습니다.";
        setProvidersError((prev) => (prev === nextProviderError ? prev : nextProviderError));
      } finally {
        setProvidersLoading((prev) => (prev ? false : prev));
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await runSingleFlight("login:auth-login-settings:get", () =>
          fetch("/api/auth/login-settings", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.clone().json().catch(() => null)) as
          | { ok?: boolean; settings?: Array<{ provider?: string; enabled?: boolean }> }
          | null;
        if (!res.ok || !json?.ok || !Array.isArray(json.settings)) return;
        const passwordSetting = json.settings.find((item) => item.provider === "password");
        if (passwordSetting) {
          const nextPasswordEnabled = passwordSetting.enabled === true;
          setPasswordEnabled((prev) => (prev === nextPasswordEnabled ? prev : nextPasswordEnabled));
        }
      } catch {
        /* 비밀번호 설정 조회 실패 시 기본 노출 유지 */
      }
    })();
  }, []);

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
        router.replace(postLoginDestination);
      } catch {
        /* 세션 조회 실패 시 로그인 화면 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, postLoginDestination]);

  const oauthEnabled = providers.length > 0;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError((prev) => (prev === "" ? prev : ""));
    setLoading((prev) => (prev ? prev : true));
    const supabase = getSupabaseClient();
    if (!supabase) {
      const nextError = "Supabase 설정이 없습니다.";
      setError((prev) => (prev === nextError ? prev : nextError));
      setLoading((prev) => (prev ? false : prev));
      return;
    }
    let signInEmail = "";
    try {
      const resolveRes = await runSingleFlight(
        `login:password-resolve-identifier:${identifier.trim().toLowerCase()}`,
        () =>
          fetch("/api/auth/password-login/resolve-identifier", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ identifier }),
          })
      );
      const resolveJson = (await resolveRes.json().catch(() => null)) as
        | { identifier?: string; error?: string }
        | null;
      if (!resolveRes.ok) {
        const nextError = resolveJson?.error || "로그인 식별자를 확인하지 못했습니다.";
        setError((prev) => (prev === nextError ? prev : nextError));
        setLoading((prev) => (prev ? false : prev));
        return;
      }
      signInEmail = String(resolveJson?.identifier ?? "").trim().toLowerCase();
    } catch {
      const nextError = "로그인 식별자를 확인하지 못했습니다.";
      setError((prev) => (prev === nextError ? prev : nextError));
      setLoading((prev) => (prev ? false : prev));
      return;
    }
    if (!signInEmail) {
      const nextError = "이메일 또는 아이디를 입력하세요.";
      setError((prev) => (prev === nextError ? prev : nextError));
      setLoading((prev) => (prev ? false : prev));
      return;
    }
    let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
    try {
      signInResult = await withTimeout(
        supabase.auth.signInWithPassword({ email: signInEmail, password }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE
      );
    } catch (e) {
      setLoading((prev) => (prev ? false : prev));
      if (e instanceof Error && e.message === AUTH_TIMEOUT_MESSAGE) {
        setError((prev) => (prev === AUTH_TIMEOUT_MESSAGE ? prev : AUTH_TIMEOUT_MESSAGE));
        return;
      }
      const nextError = describeSupabaseFetchFailure(e).userMessage;
      setError((prev) => (prev === nextError ? prev : nextError));
      return;
    }
    const err = signInResult.error;
    if (err) {
      setLoading((prev) => (prev ? false : prev));
      const net = describeSupabaseFetchFailure(err);
      if (net.code !== "unknown") {
        setError((prev) => (prev === net.userMessage ? prev : net.userMessage));
        return;
      }
      const nextError = err.message || "로그인에 실패했습니다.";
      setError((prev) => (prev === nextError ? prev : nextError));
      return;
    }
    const session = signInResult.data.session;
    if (!session) {
      setLoading((prev) => (prev ? false : prev));
      const nextError = "세션이 저장되지 않았습니다. 쿠키·시크릿 모드를 확인한 뒤 다시 시도해 주세요.";
      setError((prev) => (prev === nextError ? prev : nextError));
      return;
    }
    const loginUntilNavT0 = performance.now();
    const fetchAuthT0 = performance.now();
    const ensurePromise = fetchProfileEnsureDeduped().catch(() => null);
    // 로그인 직후 체감 속도를 위해 짧게만 기다리고 즉시 이동한다.
    await Promise.race([
      ensurePromise,
      new Promise((resolve) => window.setTimeout(resolve, LOGIN_ENSURE_SOFT_WAIT_MS)),
    ]);
    void fetchAuthSessionNoStore()
      .then(() => {
        recordAppWidePhaseLastMs("login_fetch_auth_session_ms", Math.round(performance.now() - fetchAuthT0));
      })
      .catch(() => {
        // Ignore session sync failures here.
      });
    recordAppWidePhaseLastMs("login_until_navigation_ms", Math.round(performance.now() - loginUntilNavT0));
    setLoading((prev) => (prev ? false : prev));
    router.replace(postLoginDestination);
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError((prev) => (prev === "" ? prev : ""));
    setOauthBusy((prev) => (prev === provider ? prev : provider));
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        const nextError = "Supabase 설정이 없습니다.";
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
          AUTH_TIMEOUT_MESSAGE
        );
        if (oauthError) {
          setError((prev) => (prev === oauthError.message ? prev : oauthError.message));
          return;
        }
        const authorizeUrl = data?.url?.trim() ?? "";
        if (!authorizeUrl) {
          const nextError = "카카오 로그인 시작 URL을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
          setError((prev) => (prev === nextError ? prev : nextError));
          return;
        }
        window.location.assign(authorizeUrl);
        return;
      }
      const oauthProvider =
        provider === "naver"
          ? ("custom:naver" as any)
          : (mapProviderToSupabaseOAuth(provider) as Parameters<typeof supabase.auth.signInWithOAuth>[0]["provider"]);
      const { data, error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: oauthProvider,
          options: {
            redirectTo: callbackUrl,
            skipBrowserRedirect: true,
          },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE
      );
      if (oauthError) {
        const nextError = oauthError.message || "소셜 로그인을 시작하지 못했습니다.";
        setError((prev) => (prev === nextError ? prev : nextError));
        return;
      }
      const authorizeUrl = data?.url?.trim() ?? "";
      if (!authorizeUrl) {
        const nextError = "소셜 로그인 시작 URL을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setError((prev) => (prev === nextError ? prev : nextError));
        return;
      }
      window.location.assign(authorizeUrl);
    } catch (e) {
      if (e instanceof Error && e.message === AUTH_TIMEOUT_MESSAGE) {
        setError((prev) => (prev === AUTH_TIMEOUT_MESSAGE ? prev : AUTH_TIMEOUT_MESSAGE));
      } else {
        const nextError = describeSupabaseFetchFailure(e).userMessage;
        setError((prev) => (prev === nextError ? prev : nextError));
      }
    } finally {
      setOauthBusy((prev) => (prev === null ? prev : null));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-sam-fg">로그인</h1>
        <p className="mt-1 text-center sam-text-body-secondary text-sam-muted">
          관리자 설정에 따라 로그인 방식이 표시됩니다.
        </p>
        <div className="mt-5">
          <LoginProviderButtons
            providers={providers}
            disabled={Boolean(oauthBusy) || loading}
            busyProvider={oauthBusy}
            emptyText={providersLoading ? "SNS 로그인 설정을 불러오는 중…" : "현재 사용 가능한 SNS 로그인이 없습니다."}
            onSelectProvider={(provider) => void handleOAuthLogin(provider)}
          />
        </div>
        {providersError ? (
          <p className="mt-4 sam-text-body-secondary text-red-600">{providersError}</p>
        ) : null}
        {!passwordEnabled && !oauthEnabled && !providersError ? (
          <p className="mt-4 sam-text-body-secondary text-amber-700">
            현재 사용 가능한 로그인 방식이 없습니다. 관리자에게 문의해 주세요.
          </p>
        ) : null}
        {passwordEnabled ? (
          <>
            <div className="my-4 flex items-center gap-3 sam-text-helper text-sam-meta">
              <div className="h-px flex-1 bg-sam-border-soft" />
              <span>또는 아이디/비밀번호</span>
              <div className="h-px flex-1 bg-sam-border-soft" />
            </div>
            <PasswordLoginForm
              identifier={identifier}
              password={password}
              error={error}
              disabled={loading || Boolean(oauthBusy)}
              onIdentifierChange={setIdentifier}
              onPasswordChange={setPassword}
              onSubmit={handleEmailSubmit}
            />
          </>
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
