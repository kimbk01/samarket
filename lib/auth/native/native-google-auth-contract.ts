/**
 * P2 STEP 3 — Google Native Login client contract (Android).
 *
 * ACCOUNT PICKER (Google official):
 * - Native plugin calls GoogleSignInClient.signOut() before getSignInIntent()
 * - Do NOT fall back to getLastSignedInAccount on sign-in result (bypasses chooser)
 * - App logout must call NativeGoogleAuth.signOut() (see client-session-wipe)
 *
 * SECURITY (DO NOT):
 * - trust idToken on client for session creation
 * - merge accounts by email alone
 * - use email as primary link key — server uses sub from Google token verify
 */

export const NATIVE_GOOGLE_AUTH_PLUGIN_ID = "NativeGoogleAuth";

export type NativeGoogleAuthErrorCode =
  | "user_cancelled"
  | "google_native_config_error"
  | "google_native_token_missing"
  | "google_native_unavailable"
  | "google_native_exchange_not_ready"
  | "google_native_verify_failed"
  | "google_native_account_conflict"
  | "google_native_email_conflict"
  | "google_native_token_invalid";

export type NativeGoogleSignInResult = {
  provider: "google";
  idToken: string;
  userId?: string | null;
  email?: string | null;
};

export type NativeGoogleExchangeRequest = {
  provider: "google";
  idToken: string;
};

export function buildNativeGoogleExchangeRequest(
  result: NativeGoogleSignInResult,
): NativeGoogleExchangeRequest {
  return {
    provider: "google",
    idToken: result.idToken.trim(),
  };
}

export function extractNativeGooglePluginRejectRaw(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = String(record.code ?? "").trim();
    if (code) return code;
    const message = String(record.message ?? record.errorMessage ?? "").trim();
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function mapNativeGooglePluginError(raw: string | undefined | null): NativeGoogleAuthErrorCode {
  const code = String(raw ?? "").trim().toLowerCase();
  if (code === "user_cancelled" || code === "canceled" || code === "cancelled") {
    return "user_cancelled";
  }
  if (
    code === "google_native_config_error"
    || code === "not_configured"
    || code.includes("unimplemented")
    || code.includes("not implemented")
    || code.includes("plugin")
  ) {
    return "google_native_config_error";
  }
  if (code === "google_native_token_missing" || code === "token_missing") {
    return "google_native_token_missing";
  }
  if (code === "google_native_unavailable" || code === "google_native_in_flight") {
    return "google_native_unavailable";
  }
  return "google_native_unavailable";
}

/** Android native Google vs Web OAuth 분기 — unit testable */
export function shouldUseNativeGoogleOAuth(provider: string, nativeGoogleAvailable: boolean): boolean {
  return provider === "google" && nativeGoogleAvailable;
}
