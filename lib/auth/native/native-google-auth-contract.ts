/**
 * P2 STEP 3 — Google Native Login client contract (Android).
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

export function parseNativeGoogleExchangeBody(
  body: Record<string, unknown>,
): NativeGoogleExchangeRequest | null {
  const provider = String(body.provider ?? "").trim().toLowerCase();
  if (provider !== "google") return null;

  const idToken = readNonEmptyString(body.idToken ?? body.token);
  if (!idToken) return null;

  return { provider: "google", idToken };
}

function readNonEmptyString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
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

export function isNativeGoogleAuthErrorCode(code: string): code is NativeGoogleAuthErrorCode {
  return (
    code === "user_cancelled"
    || code === "google_native_config_error"
    || code === "google_native_token_missing"
    || code === "google_native_unavailable"
    || code === "google_native_exchange_not_ready"
    || code === "google_native_verify_failed"
    || code === "google_native_account_conflict"
    || code === "google_native_token_invalid"
  );
}

export function mapNativeGooglePluginError(raw: string | undefined | null): NativeGoogleAuthErrorCode {
  const code = String(raw ?? "").trim().toLowerCase();
  if (code === "user_cancelled" || code === "canceled" || code === "cancelled") {
    return "user_cancelled";
  }
  if (code === "google_native_config_error" || code === "not_configured") {
    return "google_native_config_error";
  }
  if (code === "google_native_token_missing" || code === "token_missing") {
    return "google_native_token_missing";
  }
  return "google_native_unavailable";
}

/** Android native Google vs Web OAuth 분기 — unit testable */
export function shouldUseNativeGoogleOAuth(provider: string, nativeGoogleAvailable: boolean): boolean {
  return provider === "google" && nativeGoogleAvailable;
}
