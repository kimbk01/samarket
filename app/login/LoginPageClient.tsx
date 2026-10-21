"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { AuthAccountStatusNoticeBlock, AuthLoginNotice, type AuthLoginNoticeState } from "@/components/auth/AuthLoginNotice";
import { usePasswordLogin } from "@/components/auth/usePasswordLogin";
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
import { parseProviderEmailConflictRedirectParams } from "@/components/auth/provider-email-conflict-redirect";
import { OAuthInlineLoginHint } from "@/components/auth/OAuthInlineLoginHint";
import { OAUTH_COMPLETING_EVENT } from "@/lib/auth/oauth/native-oauth-return-bridge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { mapAuthErrorMessage, resolveAuthAccountStatusNotice } from "@/lib/auth/login-error-i18n";

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
    visiblePendingOAuthProvider,
    oauthInlineStatus,
    oauthError,
    startOAuthProvider,
  } = useOAuthLogin({
    next: next ?? null,
    onAuthSuccess: handleAuthSuccess,
  });
  const passwordLogin = usePasswordLogin({
    next: next ?? null,
    router,
    keepLoadingOnSuccess: true,
  });
  const { error, loading } = passwordLogin;
  /** 안내(로그아웃·세션 만료) / 오류 / 계정 상태(정지·차단·탈퇴) — 톤 분리 (P2-15) */
  const [notice, setNotice] = useState<AuthLoginNoticeState | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  useEffect(() => {
    if (openInternalLogin) {
      setShowEmailLogin(true);
    }
  }, [openInternalLogin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loginReason && window.location.search.length === 0) return;
    const showNotice = (nextNotice: AuthLoginNoticeState) => {
      setNotice((prev) =>
        prev?.tone === nextNotice.tone && prev.text === nextNotice.text ? prev : nextNotice,
      );
    };
    if (loginReason === "session_expired") {
      showNotice({ tone: "info", text: t("auth_session_expired_notice") });
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    if (loginReason === "auth_required") {
      showNotice({ tone: "info", text: t("auth_login_required_notice") });
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    if (loginReason === "logout") {
      blockedFromLogoutLandingRef.current = true;
      showNotice({ tone: "info", text: t("auth_logout_success_notice") });
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error")?.trim() ?? "";
    const authErrorDetail = params.get("auth_error_detail")?.trim() ?? "";
    const errorCode = params.get("error")?.trim() ?? "";
    const code = authError || errorCode;

    /**
     * P1-4 hardening: 연결 stash 는 콜백이 URL 로만 넘긴다 — 읽은 즉시 history 에서 제거하고,
     * 충돌 모달 맥락(email·attempted·existing 전부 유효)이 있을 때만 보관한다. 단독 주입은 버린다.
     */
    const conflictRedirect = parseProviderEmailConflictRedirectParams(params);
    if (conflictRedirect.hadStashParam) {
      try {
        window.history.replaceState(window.history.state, "", withNextSearchParam("/login", next ?? null));
      } catch {
        /* ignore — router.replace 가 이어서 정리 */
      }
    }
    if (conflictRedirect.conflict) {
      openProviderEmailConflictFromRedirect(conflictRedirect.conflict);
      dispatchOAuthPendingClear("provider_email_conflict");
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }
    if (conflictRedirect.hadStashParam && !code) {
      router.replace(withNextSearchParam("/login", next ?? null), { scroll: false });
      return;
    }

    if (!code) return;
    dispatchOAuthPendingClear("exchange_failed");
    const accountStatus = resolveAuthAccountStatusNotice(code);
    if (accountStatus) {
      showNotice({ tone: "account", text: mapAuthErrorMessage(code, authErrorDetail, t), accountStatus });
    } else {
      const message =
        code === "oauth_start_failed" || code === "missing_authorize_url"
          ? t("auth_err_oauth_start_failed")
          : mapAuthErrorMessage(code, authErrorDetail, t);
      showNotice({ tone: "error", text: message });
    }
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
          if (providersJson?.error) console.warn("[login] providers load failed", { status: providersRes.status });
          nextProvidersError = t("auth_sns_providers_load_failed");
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

  /** 새 로그인 시작 시 이전 안내(로그아웃됨·세션 만료)를 지운다 — 로그인 진행 중 "로그아웃되었습니다" 잔존 방지 */
  const clearEntryNotice = useCallback(() => {
    setNotice((prev) => (prev && prev.tone === "info" ? null : prev));
  }, []);

  const handleOAuthLogin = (provider: OAuthProvider) => {
    clearEntryNotice();
    void startOAuthProvider(provider);
  };

  const handleOpenInternalLogin = useCallback(() => {
    setShowEmailLogin(true);
  }, []);

  /** 소셜 로그인 복귀 후 서버 완료 대기 — 폼 대신 "로그인 중" 전체 화면 (깜빡임 방지) */
  const [oauthCompleting, setOauthCompleting] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    const onCompleting = () => {
      setOauthCompleting(true);
      // 이동이 끝내 일어나지 않으면 폼으로 복귀 (무한 로딩 방지)
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setOauthCompleting(false), 20_000);
    };
    window.addEventListener(OAUTH_COMPLETING_EVENT, onCompleting);
    return () => {
      window.removeEventListener(OAUTH_COMPLETING_EVENT, onCompleting);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);

  /** 비밀번호 폼 오류 > OAuth 오류 > URL 안내 순 — 하나만 표시 */
  const formError = error || oauthError || "";
  const displayNotice: AuthLoginNoticeState | null = formError
    ? { tone: "error", text: formError }
    : notice;

  if (oauthCompleting) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4"
        data-testid="auth-oauth-completing"
        role="status"
        aria-live="polite"
      >
        <DibayAuthLogo size={56} />
        <p className="sam-text-body text-sam-muted">{t("auth_oauth_signing_in_label")}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10"
        data-keyboard-tap-dismiss="1"
      >
      <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
        <div className="mx-auto flex justify-center" aria-hidden>
          <DibayAuthLogo size={56} />
        </div>
        <h1 className="mt-3 text-center text-lg font-semibold text-sam-fg">{t("auth_login_title")}</h1>
        <p className="mt-1 text-center sam-text-body-secondary text-sam-muted" data-testid="auth-login-auto-signup-hint">
          {t("auth_login_auto_signup_hint")}
        </p>
        <div className="mt-5">
          <LoginProviderButtons
            surface="page"
            providers={providers}
            disabled={loading}
            pendingOAuthProvider={pendingOAuthProvider}
            signingInOAuthProvider={visiblePendingOAuthProvider}
            emptyText={
              providersError
                ? undefined
                : providersLoading
                  ? t("auth_sns_providers_loading")
                  : t("auth_sns_providers_none")
            }
            showEmailEntry={passwordEnabled && !showEmailLogin}
            onEmailLoginClick={handleOpenInternalLogin}
            onSelectProvider={(provider) => void handleOAuthLogin(provider)}
          />
          <OAuthInlineLoginHint status={oauthInlineStatus} className="mt-3" />
        </div>
        {providersError ? (
          <p className="mt-4 sam-text-body-secondary text-sam-danger">{providersError}</p>
        ) : null}
        {!passwordEnabled && !oauthEnabled && !providersError ? (
          <p className="mt-4 sam-text-body-secondary text-sam-warning">
            {t("auth_no_login_methods")}
          </p>
        ) : null}
        {displayNotice?.tone === "account" && displayNotice.accountStatus ? (
          <AuthAccountStatusNoticeBlock status={displayNotice.accountStatus} text={displayNotice.text} className="mt-4" />
        ) : null}
        {passwordEnabled && showEmailLogin ? (
          <div className="mt-4" data-auth-surface="internal" data-testid="auth-internal-login-panel">
            <p className="sam-text-body-secondary text-sam-muted">
              {t("auth_login_internal_hint")}
            </p>
            {displayNotice && displayNotice.tone === "info" ? (
              <AuthLoginNotice notice={displayNotice} className="mt-2" />
            ) : null}
            <PasswordLoginForm
              identifier={passwordLogin.identifier}
              password={passwordLogin.password}
              error={formError}
              loading={loading}
              loadingText={passwordLogin.statusText}
              disabled={loading || pendingOAuthProvider != null}
              className="mt-2 space-y-4"
              onIdentifierChange={passwordLogin.setIdentifier}
              onPasswordChange={passwordLogin.setPassword}
              onSubmit={(event) => {
                clearEntryNotice();
                return passwordLogin.submit(event);
              }}
            />
          </div>
        ) : displayNotice && displayNotice.tone !== "account" ? (
          <AuthLoginNotice notice={displayNotice} className="mt-4" />
        ) : null}
      </div>
      </div>
      <AuthProviderEmailConflictHost
        onLoginWithExistingProvider={handleOAuthLogin}
        onOpenInternalLogin={handleOpenInternalLogin}
      />
    </>
  );
}

export default function LoginPageClient() {
  return <LoginPageContent />;
}
