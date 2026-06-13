import type { MessageKey } from "@/lib/i18n/messages";
import type { SupabaseFetchFailureDescription } from "@/lib/supabase/describe-supabase-fetch-failure";
import { mapOAuthSignInErrorMessage as mapOAuthSignInErrorMessageFromOAuth } from "@/lib/auth/oauth/errors";

/** `withTimeout` / `rejectAfter` 식별용 — UI 문구는 `auth_err_auth_timeout` */
export const AUTH_REQUEST_TIMEOUT_SIGNAL = "@@samarket_auth_request_timeout@@";
export const AUTH_IDENTIFIER_RESOLVE_TIMEOUT_SIGNAL = "@@samarket_auth_identifier_resolve_timeout@@";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function mapPasswordLoginErrorMessage(raw: string, t: TranslateFn): string {
  const message = String(raw ?? "").trim();
  const normalized = message.toLowerCase();
  if (!message) return t("auth_err_login_failed");
  if (normalized.includes("invalid login credentials")) return t("auth_err_invalid_credentials");
  if (normalized.includes("email not confirmed")) return t("auth_err_email_not_confirmed");
  return message;
}

export function mapPasswordResolveErrorCodeToMessage(code: string, fallback: string, t: TranslateFn): string {
  if (code === "identifier_required") return t("auth_err_identifier_required");
  if (code === "login_identifier_not_found") return t("auth_err_login_id_not_found");
  if (code === "login_identifier_conflict") return t("auth_err_login_id_conflict");
  if (code === "password_login_blocked_for_social_account") return t("auth_err_sns_only_account");
  if (code === "login_identifier_lookup_unconfigured") return t("auth_err_login_lookup_unconfigured");
  if (code === "login_identifier_lookup_failed") return t("auth_err_login_identifier_lookup_failed");
  if (code === "rate_limited" || code === "too_many_requests") return t("auth_err_rate_limited");
  return fallback;
}

export function mapAuthErrorMessage(code: string, detail: string | undefined, t: TranslateFn): string {
  if (!code) return t("auth_err_login_process_failed");
  if (code === "provider_not_enabled") return t("auth_err_provider_not_enabled");
  if (code === "provider_key_missing") return t("auth_err_provider_key_missing");
  if (code === "redirect_uri_not_allowed") return t("auth_err_redirect_uri_not_allowed");
  if (code === "callback_failed") {
    const normalizedDetail = String(detail ?? "").trim();
    if (!normalizedDetail) return t("auth_err_callback_failed");
    return t("auth_err_callback_failed_detail", { detail: normalizedDetail });
  }
  if (code === "profile_ensure_failed") return t("auth_err_profile_ensure_failed");
  if (code === "session_sync_failed") return t("auth_err_session_sync_failed");
  if (code === "user_not_found") return t("auth_err_user_not_found");
  if (code === "invalid_provider") return t("auth_err_invalid_provider");
  if (code === "provider_mismatch") return t("auth_err_provider_mismatch");
  if (code === "missing_code") return t("auth_err_missing_code");
  if (code === "provider_id_missing") return t("auth_err_provider_id_missing");
  if (code === "user_upsert_failed") return t("auth_err_user_upsert_failed");
  if (code === "supabase_service_unconfigured") return t("auth_err_supabase_service_unconfigured");
  if (code === "session_missing") return t("auth_err_session_missing");
  return t("auth_err_login_failed_code", { code });
}

export function mapOAuthSignInErrorMessage(
  errorMessage: string,
  errorCode: string | undefined,
  t: TranslateFn,
): string {
  return mapOAuthSignInErrorMessageFromOAuth(errorMessage, errorCode, t);
}

export function mapSupabaseFetchFailureToMessage(
  failure: SupabaseFetchFailureDescription,
  t: TranslateFn
): string {
  switch (failure.code) {
    case "dns_enotfound":
      return t("auth_supabase_fail_dns");
    case "timeout":
      return t("auth_supabase_fail_timeout");
    case "fetch_failed":
      return t("auth_supabase_fail_fetch");
    default:
      return t("auth_supabase_fail_unknown");
  }
}
