"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { OAuthInlineLoginHint } from "@/components/auth/OAuthInlineLoginHint";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { getSupabaseClient } from "@/lib/supabase/client";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import {
  AUTH_REQUEST_TIMEOUT_SIGNAL,
  mapPasswordLoginErrorMessage,
  mapPasswordResolveErrorCodeToMessage,
  mapSupabaseFetchFailureToMessage,
} from "@/lib/auth/login-error-i18n";
import { finishClientAuthLogin } from "@/lib/auth/finish-client-auth-login.client";
import { useOAuthLogin, type OAuthAuthSuccessInput } from "@/lib/auth/oauth/use-oauth-login";
import type { LoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { AuthGateOverlay } from "@/components/auth/AuthGateOverlay";
import { AuthProviderEmailConflictHost } from "@/components/auth/AuthProviderEmailConflictHost";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";

const AUTH_REQUEST_TIMEOUT_MS = 25_000;
const LOGIN_IDENTIFIER_RESOLVE_TIMEOUT_MS = 10_000;

type Props = {
  open: boolean;
  detail: LoginRequiredDetail | null;
  onClose: () => void;
};

function looksLikeEmailForLogin(identifierRaw: string): boolean {
  const s = identifierRaw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function rejectAfter(ms: number, signal: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(signal)), ms);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, signal: string): Promise<T> {
  return Promise.race([p, rejectAfter(ms, signal)]);
}

function mapHttpStatusToResolveErrorCode(status: number): string {
  if (status === 429) return "rate_limited";
  return "";
}

export function AuthModal({ open, detail, onClose }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [providers, setProviders] = useState<AuthProviderPublic[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordLoginStatus, setPasswordLoginStatus] = useState("");

  const next = useMemo(() => {
    if (detail?.next?.trim()) return detail.next.trim();
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}`;
  }, [detail?.next]);

  const handleAuthSuccess = useCallback(
    async (input: OAuthAuthSuccessInput) => {
      await finishClientAuthLogin({
        redirectTo: input.redirectTo,
        pendingToken: detail?.token,
        next,
        needsTermsAgreement: input.needsTermsAgreement,
        consentComplete: input.consentComplete,
        signupComplete: input.signupComplete,
        // Slice 6-7: preserve Native Thin Handoff client-sync flag (do not drop).
        syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
        onCloseModal: onClose,
        router,
      });
    },
    [detail?.token, next, onClose, router],
  );

  const {
    pendingOAuthProvider,
    oauthInlineStatus,
    oauthError,
    startOAuthProvider,
    resetOAuthOnClose,
  } = useOAuthLogin({
    next,
    pendingToken: detail?.token,
    onModalClose: onClose,
    onAuthSuccess: handleAuthSuccess,
  });

  useEffect(() => {
    if (open) return;
    setShowEmailLogin(false);
    setError(null);
    setIdentifier("");
    setPassword("");
    resetOAuthOnClose();
  }, [open, resetOAuthOnClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setProvidersLoading(true);
      try {
        const [providersRes, settingsRes] = await Promise.all([
          runSingleFlight("auth-modal:providers", () =>
            fetch("/api/auth-providers?enabled=true", { credentials: "include", cache: "no-store" }),
          ),
          runSingleFlight("auth-modal:settings", () =>
            fetch("/api/auth/login-settings", { credentials: "include", cache: "no-store" }),
          ),
        ]);
        const providersJson = (await providersRes.json().catch(() => null)) as
          | { ok?: boolean; providers?: AuthProviderPublic[] }
          | null;
        const settingsJson = (await settingsRes.json().catch(() => null)) as
          | { ok?: boolean; settings?: Array<{ provider?: string; enabled?: boolean }> }
          | null;
        if (cancelled) return;
        setProviders(providersRes.ok && providersJson?.ok && Array.isArray(providersJson.providers) ? providersJson.providers : []);
        const passwordSetting = settingsJson?.settings?.find((item) => item.provider === "password");
        setPasswordEnabled(passwordSetting ? passwordSetting.enabled === true : true);
      } catch {
        if (!cancelled) setProviders([]);
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const finishAuthenticated = useCallback(async () => {
    await finishClientAuthLogin({
      pendingToken: detail?.token,
      next,
      onCloseModal: onClose,
      router,
    });
  }, [detail?.token, next, onClose, router]);

  const handleEmailSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;
      setError(null);
      setLoading(true);
      setPasswordLoginStatus(t("auth_status_checking"));
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError(t("auth_err_supabase_unconfigured"));
          return;
        }
        if (!identifier.trim()) {
          setError(t("auth_err_identifier_required"));
          return;
        }
        if (!password) {
          setError(t("auth_err_password_required"));
          return;
        }

        let signInEmail = "";
        if (looksLikeEmailForLogin(identifier)) {
          signInEmail = identifier.trim().toLowerCase();
        } else {
          const resolveRes = await fetchWithTimeout("/api/auth/password-login/resolve-identifier", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ identifier }),
            timeoutMs: LOGIN_IDENTIFIER_RESOLVE_TIMEOUT_MS,
          });
          const resolveJson = (await resolveRes.json().catch(() => null)) as
            | { identifier?: string; error?: string; code?: string }
            | null;
          if (!resolveRes.ok) {
            const fallback = mapPasswordLoginErrorMessage(
              resolveJson?.error ?? t("auth_err_login_identifier_lookup_failed"),
              t,
            );
            const code = String(resolveJson?.code ?? "").trim() || mapHttpStatusToResolveErrorCode(resolveRes.status);
            setError(mapPasswordResolveErrorCodeToMessage(code, fallback, t));
            return;
          }
          signInEmail = String(resolveJson?.identifier ?? "").trim().toLowerCase();
        }

        if (!signInEmail) {
          setError(t("auth_err_enter_email_or_id_short"));
          return;
        }

        setPasswordLoginStatus(t("auth_status_navigating"));
        const signInResult = await withTimeout(
          supabase.auth.signInWithPassword({ email: signInEmail, password }),
          AUTH_REQUEST_TIMEOUT_MS,
          AUTH_REQUEST_TIMEOUT_SIGNAL,
        );
        if (signInResult.error) {
          setError(mapPasswordLoginErrorMessage(signInResult.error.message || t("auth_err_login_failed"), t));
          return;
        }
        if (!signInResult.data.session) {
          setError(t("auth_err_session_not_persisted"));
          return;
        }
        await supabase.auth.getSession().catch(() => null);
        await finishAuthenticated();
      } catch (err) {
        if (err instanceof Error && err.message === AUTH_REQUEST_TIMEOUT_SIGNAL) {
          setError(t("auth_err_auth_timeout"));
        } else {
          setError(mapSupabaseFetchFailureToMessage(describeSupabaseFetchFailure(err), t));
        }
      } finally {
        setLoading(false);
        setPasswordLoginStatus("");
      }
    },
    [finishAuthenticated, identifier, loading, password, t],
  );

  const handleOAuthLogin = useCallback(
    (provider: OAuthProvider) => {
      void startOAuthProvider(provider);
    },
    [startOAuthProvider],
  );

  const displayError = error ?? oauthError;

  return (
    <>
      <AuthGateOverlay open={open} onClose={onClose} labelledBy="dibay-auth-modal-title">
        <div className="relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full text-[#1e3932]/60 hover:bg-[#f6f6f6] hover:text-[#1e3932]"
            aria-label={t("common_close")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="mx-auto flex justify-center" aria-hidden>
            <DibayAuthLogo size={56} />
          </div>
          <h2 id="dibay-auth-modal-title" className="mt-3 text-center text-lg font-semibold text-[#1e3932]">
            {t("auth_login_title")}
          </h2>

          <div className="mt-5 space-y-4">
            <LoginProviderButtons
              providers={providers}
              disabled={loading}
              pendingOAuthProvider={pendingOAuthProvider}
              emptyText={providersLoading ? t("auth_sns_providers_loading") : t("auth_sns_providers_none")}
              showEmailEntry={passwordEnabled && !showEmailLogin}
              onEmailLoginClick={() => setShowEmailLogin(true)}
              onSelectProvider={(provider) => void handleOAuthLogin(provider)}
            />
            <OAuthInlineLoginHint status={oauthInlineStatus} />
            {!showEmailLogin && displayError ? (
              <p className="sam-text-body-secondary text-center text-red-600">{displayError}</p>
            ) : null}
            {passwordEnabled && showEmailLogin ? (
              <div data-auth-surface="internal" data-testid="auth-internal-login-panel">
                <p className="mt-1 sam-text-body-secondary text-center text-[#667085]">
                  {t("auth_login_internal_hint")}
                </p>
                <PasswordLoginForm
                  identifier={identifier}
                  password={password}
                  error={displayError}
                  disabled={loading || pendingOAuthProvider != null}
                  loading={loading}
                  loadingText={passwordLoginStatus}
                  className="mt-2 space-y-4"
                  onIdentifierChange={setIdentifier}
                  onPasswordChange={setPassword}
                  onSubmit={handleEmailSubmit}
                />
              </div>
            ) : null}
          </div>
        </div>
      </AuthGateOverlay>
      <AuthProviderEmailConflictHost />
    </>
  );
}
