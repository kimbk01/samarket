import type { MessageKey } from "@/lib/i18n/messages";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type OAuthStartErrorCode =
  | "oauth_start_failed"
  | "oauth_redirect_mismatch"
  | "oauth_redirect_missing"
  | "native_oauth_redirect_invalid"
  | "browser_plugin_unavailable"
  | "browser_open_rejected"
  | "navigation_failed"
  | "invalid_provider"
  | "supabase_unconfigured";

export function mapOAuthStartError(
  errorCode: OAuthStartErrorCode | string | undefined,
  t: TranslateFn,
): string {
  const code = String(errorCode ?? "").trim();
  if (code === "oauth_redirect_mismatch" || code === "supabase_whitelist_fallback") {
    return t("auth_err_oauth_redirect_mismatch");
  }
  if (code === "oauth_redirect_missing" || code === "redirect_to_missing") {
    return t("auth_err_oauth_redirect_missing");
  }
  if (code === "native_oauth_redirect_invalid" || code === "native_https_redirect") {
    return t("auth_err_native_oauth_redirect_invalid");
  }
  if (code === "browser_plugin_unavailable") {
    return t("auth_err_oauth_browser_plugin_unavailable");
  }
  if (code === "browser_open_rejected") {
    return t("auth_err_oauth_browser_open_failed");
  }
  if (code === "navigation_failed") {
    return t("auth_err_oauth_launch_navigation_failed");
  }
  if (code === "invalid_provider") {
    return t("auth_err_invalid_provider");
  }
  if (code === "supabase_unconfigured") {
    return t("auth_err_supabase_unconfigured");
  }
  return t("auth_err_oauth_start_failed");
}

/** @deprecated mapOAuthStartError 사용 — login-error-i18n 호환 */
export function mapOAuthSignInErrorMessage(
  errorMessage: string,
  errorCode: string | undefined,
  t: TranslateFn,
): string {
  const message = String(errorMessage ?? "").trim();
  if (message === "missing_authorize_url") return t("auth_err_oauth_authorize_url_failed");
  return mapOAuthStartError(errorCode || message, t);
}
