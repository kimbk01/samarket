"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
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
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { wipeClientSessionState, clearPostLogoutBfcacheGuard } from "@/lib/auth/client-session-wipe";
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeFreshLoginLandingPath } from "@/lib/auth/safe-next-path";
import { useOAuthLogin } from "@/lib/auth/oauth/use-oauth-login";
import { consumePendingAuthAction, clearStoredLoginRequiredDetail, type LoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { AuthGateOverlay } from "@/components/auth/AuthGateOverlay";
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

  const {
    pendingOAuthProvider,
    oauthError,
    startOAuthProvider,
    resetOAuthOnClose,
  } = useOAuthLogin({ next });

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
    const consumed = await consumePendingAuthAction(detail?.token);
    clearStoredLoginRequiredDetail();
    onClose();
    if (!consumed && typeof window !== "undefined") {
      await wipeClientSessionState("pre_login_bootstrap", { setPostLogoutGuard: false });
      await ensureAppBoot();
      clearPostLogoutBfcacheGuard();
      let target = sanitizeFreshLoginLandingPath(next) ?? POST_LOGIN_PATH;
      try {
        const { status, json } = await fetchSignupStatusDeduped();
        if (status === 200 && json?.route?.trim()) {
          target = sanitizeFreshLoginLandingPath(json.route.trim()) ?? POST_LOGIN_PATH;
        }
      } catch {
        /* fallback to next */
      }
      window.location.replace(target);
    }
  }, [detail?.token, next, onClose]);

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
        {t("auth_login_required_title")}
      </h2>

      <div className="mt-5 space-y-4">
        <LoginProviderButtons
          providers={providers}
          disabled={loading}
          pendingOAuthProvider={pendingOAuthProvider}
          emptyText={providersLoading ? t("auth_sns_providers_loading") : t("auth_sns_providers_none")}
          showEmailEntry={passwordEnabled}
          onEmailLoginClick={() => setShowEmailLogin(true)}
          onSelectProvider={(provider) => void handleOAuthLogin(provider)}
        />
        {!showEmailLogin && displayError ? (
          <p className="sam-text-body-secondary text-center text-red-600">{displayError}</p>
        ) : null}
        {passwordEnabled && showEmailLogin ? (
          <PasswordLoginForm
            identifier={identifier}
            password={password}
            error={displayError}
            disabled={loading || pendingOAuthProvider != null}
            loading={loading}
            loadingText={passwordLoginStatus}
            className="mt-4 space-y-4"
            onIdentifierChange={setIdentifier}
            onPasswordChange={setPassword}
            onSubmit={handleEmailSubmit}
          />
        ) : null}
      </div>
      </div>
    </AuthGateOverlay>
  );
}
