"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { mapProviderToSupabaseOAuth } from "@/lib/auth/login-settings";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfileEnsureDeduped } from "@/lib/profile/ensure-profile-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const AUTH_REQUEST_TIMEOUT_MS = 25_000;
const LOGIN_ENSURE_SOFT_WAIT_MS = 120;
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
  const postLoginDestination = POST_LOGIN_PATH;
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
    if (typeof window !== "undefined" && window.location.search.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth_error")?.trim() ?? "";
      if (authError) {
        const message = mapAuthErrorMessage(authError);
        setError(message);
        window.alert(message);
      }
      router.replace("/login", { scroll: false });
    }
  }, [router]);

  useEffect(() => {
    void (async () => {
      setProvidersLoading(true);
      setProvidersError(null);
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
          setProvidersError(json?.error || "SNS 로그인 목록을 불러오지 못했습니다.");
          return;
        }
        setProviders(json.providers);
      } catch {
        setProvidersError("SNS 로그인 목록을 불러오지 못했습니다.");
      } finally {
        setProvidersLoading(false);
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
          setPasswordEnabled(passwordSetting.enabled === true);
        }
      } catch {
        /* 비밀번호 설정 조회 실패 시 기본 노출 유지 */
      }
    })();
  }, []);

  useEffect(() => {
    void router.prefetch(postLoginDestination);
  }, [router, postLoginDestination]);

  const oauthEnabled = providers.length > 0;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase 설정이 없습니다.");
      setLoading(false);
      return;
    }
    let signInEmail = "";
    try {
      const resolveRes = await fetch("/api/auth/password-login/resolve-identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier }),
      });
      const resolveJson = (await resolveRes.json().catch(() => null)) as
        | { identifier?: string; error?: string }
        | null;
      if (!resolveRes.ok) {
        setError(resolveJson?.error || "로그인 식별자를 확인하지 못했습니다.");
        setLoading(false);
        return;
      }
      signInEmail = String(resolveJson?.identifier ?? "").trim().toLowerCase();
    } catch {
      setError("로그인 식별자를 확인하지 못했습니다.");
      setLoading(false);
      return;
    }
    if (!signInEmail) {
      setError("이메일 또는 아이디를 입력하세요.");
      setLoading(false);
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
      setLoading(false);
      if (e instanceof Error && e.message === AUTH_TIMEOUT_MESSAGE) {
        setError(AUTH_TIMEOUT_MESSAGE);
        return;
      }
      setError(describeSupabaseFetchFailure(e).userMessage);
      return;
    }
    const err = signInResult.error;
    if (err) {
      setLoading(false);
      const net = describeSupabaseFetchFailure(err);
      if (net.code !== "unknown") {
        setError(net.userMessage);
        return;
      }
      setError(err.message || "로그인에 실패했습니다.");
      return;
    }
    const session = signInResult.data.session;
    if (!session) {
      setLoading(false);
      setError("세션이 저장되지 않았습니다. 쿠키·시크릿 모드를 확인한 뒤 다시 시도해 주세요.");
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
    setLoading(false);
    router.replace(postLoginDestination);
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError("");
    setOauthBusy(provider);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase 설정이 없습니다.");
        return;
      }
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/auth/oauth/callback?provider=${encodeURIComponent(provider)}`
          : undefined;
      const { error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: mapProviderToSupabaseOAuth(provider),
          options: { redirectTo },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE
      );
      if (oauthError) {
        setError(oauthError.message || "소셜 로그인을 시작하지 못했습니다.");
      }
    } catch (e) {
      if (e instanceof Error && e.message === AUTH_TIMEOUT_MESSAGE) {
        setError(AUTH_TIMEOUT_MESSAGE);
      } else {
        setError(describeSupabaseFetchFailure(e).userMessage);
      }
    } finally {
      setOauthBusy(null);
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
