"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import {
  AUTH_REQUEST_TIMEOUT_SIGNAL,
  mapPasswordLoginErrorMessage,
  mapPasswordResolveErrorCodeToMessage,
  mapSupabaseFetchFailureToMessage,
} from "@/lib/auth/login-error-i18n";
import {
  finishClientAuthLogin,
  resolvePasswordLoginTermsHandoff,
} from "@/lib/auth/finish-client-auth-login.client";

const AUTH_REQUEST_TIMEOUT_MS = 25_000;
const LOGIN_IDENTIFIER_RESOLVE_TIMEOUT_MS = 10_000;

type RouterLike = { replace: (href: string) => void };

export type UsePasswordLoginOptions = {
  next: string | null;
  router: RouterLike;
  pendingToken?: string | null;
  onCloseModal?: () => void;
  /**
   * /login: 전체 이동 직전 로딩을 유지해 폼이 다시 보이는 깜빡임을 막는다.
   * 모달: 닫힌 뒤 다시 열 수 있으므로 성공 후에도 로딩을 해제한다.
   */
  keepLoadingOnSuccess?: boolean;
};

export function looksLikeEmailForLogin(identifierRaw: string): boolean {
  const s = identifierRaw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function mapHttpStatusToResolveErrorCode(status: number): string {
  if (status === 429) return "rate_limited";
  return "";
}

function withTimeout<T>(p: Promise<T>, ms: number, signal: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(signal)), ms);
    }),
  ]);
}

/**
 * 아이디(password) 로그인 단일 핸들러 — /login 페이지와 AuthModal 공용 (P1-9).
 * 성공 후 signup-status 1회 → consentComplete 를 finishClientAuthLogin 에 전달 (미동의 → terms).
 */
export function usePasswordLogin({
  next,
  router,
  pendingToken,
  onCloseModal,
  keepLoadingOnSuccess = false,
}: UsePasswordLoginOptions) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const loadingRef = useRef(false);

  const showError = useCallback((message: string) => {
    setError((prev) => (prev === message ? prev : message));
  }, []);

  const reset = useCallback(() => {
    setIdentifier("");
    setPassword("");
    setError("");
    setLoading(false);
    setStatusText("");
    loadingRef.current = false;
  }, []);

  const submit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      /** 이중 제출 가드 — PasswordManager 자동입력·Enter 연속 입력 */
      if (loadingRef.current) return;
      loadingRef.current = true;
      setError("");
      setLoading(true);
      setStatusText(t("auth_status_checking"));
      let leaveShellIntact = false;

      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          showError(t("auth_err_supabase_unconfigured"));
          return;
        }
        if (!identifier.trim()) {
          showError(t("auth_err_identifier_required"));
          return;
        }
        if (!password) {
          showError(t("auth_err_password_required"));
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
                }),
            );
            const resolveJson = (await resolveRes.json().catch(() => null)) as
              | { identifier?: string; error?: string; code?: string }
              | null;
            if (!resolveRes.ok) {
              const fallback = mapPasswordLoginErrorMessage(
                resolveJson?.error ?? t("auth_err_login_identifier_lookup_failed"),
                t,
              );
              const code =
                String(resolveJson?.code ?? "").trim() || mapHttpStatusToResolveErrorCode(resolveRes.status);
              showError(mapPasswordResolveErrorCodeToMessage(code, fallback, t));
              return;
            }
            signInEmail = String(resolveJson?.identifier ?? "").trim().toLowerCase();
          } catch (resolveError) {
            showError(
              resolveError instanceof DOMException && resolveError.name === "AbortError"
                ? t("auth_err_identifier_resolve_timeout")
                : t("auth_err_login_identifier_lookup_failed"),
            );
            return;
          }
        }

        if (!signInEmail) {
          showError(t("auth_err_enter_email_or_id_short"));
          return;
        }

        setStatusText(t("auth_status_navigating"));
        let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
        try {
          signInResult = await withTimeout(
            supabase.auth.signInWithPassword({ email: signInEmail, password }),
            AUTH_REQUEST_TIMEOUT_MS,
            AUTH_REQUEST_TIMEOUT_SIGNAL,
          );
        } catch (signInError) {
          if (signInError instanceof Error && signInError.message === AUTH_REQUEST_TIMEOUT_SIGNAL) {
            showError(t("auth_err_auth_timeout"));
            return;
          }
          showError(mapSupabaseFetchFailureToMessage(describeSupabaseFetchFailure(signInError), t));
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
          showError(message);
          return;
        }

        if (!signInResult.data.session) {
          showError(t("auth_err_session_not_persisted"));
          return;
        }

        const loginUntilNavT0 = performance.now();
        void supabase.auth.getSession().catch(() => {
          /* ignore */
        });

        /** P1-9: 아이디 로그인도 약관 게이트를 통과한다 — signup-status 1회 */
        const termsHandoff = await resolvePasswordLoginTermsHandoff(next);
        recordAppWidePhaseLastMs(
          "login_until_navigation_ms",
          Math.round(performance.now() - loginUntilNavT0),
        );
        leaveShellIntact = keepLoadingOnSuccess;
        await finishClientAuthLogin({
          ...termsHandoff,
          pendingToken,
          next,
          onCloseModal,
          router,
        });
      } catch (unexpected) {
        leaveShellIntact = false;
        // 원문은 콘솔로만 (§5.6) — 화면은 일반 안내.
        showError(t("auth_err_login_unknown"));
        if (typeof console !== "undefined") {
          console.error("[samarket:login] unexpected password login failure", unexpected);
        }
      } finally {
        loadingRef.current = false;
        if (!leaveShellIntact) {
          setLoading(false);
          setStatusText("");
        }
      }
    },
    [identifier, keepLoadingOnSuccess, next, onCloseModal, password, pendingToken, router, showError, t],
  );

  return {
    identifier,
    setIdentifier,
    password,
    setPassword,
    error,
    setError,
    loading,
    statusText,
    submit,
    reset,
  };
}
