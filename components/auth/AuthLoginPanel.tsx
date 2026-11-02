"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { OAuthInlineLoginHint } from "@/components/auth/OAuthInlineLoginHint";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { usePasswordLogin } from "@/components/auth/usePasswordLogin";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { finishClientAuthLogin } from "@/lib/auth/finish-client-auth-login.client";
import { useOAuthLogin, type OAuthAuthSuccessInput } from "@/lib/auth/oauth/use-oauth-login";
import { DibayAuthLogoHiddenGate } from "@/components/auth/DibayAuthLogoHiddenGate";

/**
 * 화면에 바로 놓는 고객 로그인 본문 (로고 · 제목 · 소셜 로그인 · 숨김 운영자 로그인) — 비로그인 내정보(`/mypage`).
 * 처리 순서는 `AuthModal` 과 같다. 계정 충돌 안내는 항상 떠 있는 `AuthModal` 쪽 호스트 1개만 띄운다(중복 모달 방지).
 * 운영자(아이디·비밀번호) 로그인 입구는 화면에 없고 로고 4회 탭으로만 열린다.
 */
export function AuthLoginPanel({
  active,
  next,
  pendingToken,
  onCloseModal,
  headingId,
  headingAs: Heading = "h2",
}: {
  /** false 로 바뀌면 입력·진행 상태 초기화 (모달 닫힘) */
  active: boolean;
  next: string;
  pendingToken?: string;
  /** 모달에서만 — 로그인 완료 시 모달 닫기 */
  onCloseModal?: () => void;
  headingId?: string;
  headingAs?: "h1" | "h2";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [providers, setProviders] = useState<AuthProviderPublic[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [providersLoadFailed, setProvidersLoadFailed] = useState(false);

  const handleAuthSuccess = useCallback(
    async (input: OAuthAuthSuccessInput) => {
      await finishClientAuthLogin({
        redirectTo: input.redirectTo,
        pendingToken,
        next,
        needsTermsAgreement: input.needsTermsAgreement,
        consentComplete: input.consentComplete,
        signupComplete: input.signupComplete,
        // Slice 6-7: preserve Native Thin Handoff client-sync flag (do not drop).
        syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
        onCloseModal,
        router,
      });
    },
    [pendingToken, next, onCloseModal, router],
  );

  const {
    pendingOAuthProvider,
    authBusy,
    visiblePendingOAuthProvider,
    oauthInlineStatus,
    oauthError,
    startOAuthProvider,
    resetOAuthOnClose,
  } = useOAuthLogin({
    next,
    pendingToken,
    onModalClose: onCloseModal,
    onAuthSuccess: handleAuthSuccess,
  });

  /** P1-9: /login 과 동일한 아이디 로그인 핸들러 (약관 게이트 포함) */
  const passwordLogin = usePasswordLogin({
    next,
    router,
    pendingToken,
    onCloseModal,
  });
  const { error, loading, reset: resetPasswordLogin } = passwordLogin;

  useEffect(() => {
    if (active) return;
    setShowEmailLogin(false);
    resetPasswordLogin();
    resetOAuthOnClose();
  }, [active, resetOAuthOnClose, resetPasswordLogin]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      setProvidersLoading(true);
      try {
        const [providersRes, settingsRes] = await Promise.all([
          /** 단일 비행 응답은 호출자끼리 공유 — 본문은 `clone()` 으로 읽는다 (같은 Response 두 번 읽기 방지) */
          runSingleFlight("auth-modal:providers", () =>
            fetch("/api/auth-providers?enabled=true", { credentials: "include", cache: "no-store" }),
          ),
          runSingleFlight("auth-modal:settings", () =>
            fetch("/api/auth/login-settings", { credentials: "include", cache: "no-store" }),
          ),
        ]);
        const providersJson = (await providersRes.clone().json().catch(() => null)) as
          | { ok?: boolean; providers?: AuthProviderPublic[] }
          | null;
        const settingsJson = (await settingsRes.clone().json().catch(() => null)) as
          | { ok?: boolean; settings?: Array<{ provider?: string; enabled?: boolean }> }
          | null;
        if (cancelled) return;
        const providersOk = providersRes.ok && providersJson?.ok && Array.isArray(providersJson.providers);
        setProvidersLoadFailed(!providersOk);
        setProviders(providersOk && providersJson?.providers ? providersJson.providers : []);
        const passwordSetting = settingsJson?.settings?.find((item) => item.provider === "password");
        setPasswordEnabled(passwordSetting ? passwordSetting.enabled === true : true);
      } catch {
        if (!cancelled) {
          setProviders([]);
          setProvidersLoadFailed(true);
        }
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const handleOAuthLogin = useCallback(
    (provider: OAuthProvider) => {
      void startOAuthProvider(provider);
    },
    [startOAuthProvider],
  );

  const handleOpenInternalLogin = useCallback(() => {
    setShowEmailLogin(true);
  }, []);

  const displayError = error || oauthError || null;

  return (
    <>
      <DibayAuthLogoHiddenGate size={56} enabled={passwordEnabled} onUnlock={handleOpenInternalLogin} />
      <Heading id={headingId} className="mt-3 text-center text-lg font-semibold text-sam-fg">
        {t("auth_login_title")}
      </Heading>
      <p className="mt-1 text-center sam-text-body-secondary text-sam-muted">
        {t("auth_login_auto_signup_hint")}
      </p>

      <div className="mt-5 space-y-4">
        <LoginProviderButtons
          surface="overlay"
          providers={providers}
          disabled={loading}
          pendingOAuthProvider={pendingOAuthProvider}
          signingInOAuthProvider={visiblePendingOAuthProvider}
          emptyText={
            providersLoadFailed
              ? undefined
              : providersLoading
                ? t("auth_sns_providers_loading")
                : t("auth_sns_providers_none")
          }
          onSelectProvider={(provider) => void handleOAuthLogin(provider)}
        />
        {providersLoadFailed && !providersLoading ? (
          <p className="sam-text-body-secondary text-center text-sam-danger">
            {t("auth_sns_providers_load_failed")}
          </p>
        ) : null}
        <OAuthInlineLoginHint status={oauthInlineStatus} />
        {!showEmailLogin && displayError ? (
          <p className="sam-text-body-secondary text-center text-sam-danger" role="alert">{displayError}</p>
        ) : null}
        {passwordEnabled && showEmailLogin ? (
          <div data-auth-surface="internal" data-testid="auth-internal-login-panel">
            <p className="mt-1 sam-text-body-secondary text-center text-sam-muted">
              {t("auth_login_internal_hint")}
            </p>
            <PasswordLoginForm
              identifier={passwordLogin.identifier}
              password={passwordLogin.password}
              error={displayError}
              disabled={loading || authBusy}
              loading={loading}
              loadingText={passwordLogin.statusText}
              className="mt-2 space-y-4"
              onIdentifierChange={passwordLogin.setIdentifier}
              onPasswordChange={passwordLogin.setPassword}
              onSubmit={passwordLogin.submit}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
