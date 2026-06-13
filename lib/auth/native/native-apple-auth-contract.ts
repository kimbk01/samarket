/**
 * P2 STEP 1 — Apple Native Login client contract.
 * Server verify / Supabase session = STEP 2 (`native-token-exchange.server.ts`).
 *
 * SECURITY (DO NOT):
 * - trust identityToken on client for session creation
 * - merge accounts by email or Apple private relay email alone
 * - use email as primary link key — prefer provider user id (userIdentifier)
 */

export const NATIVE_APPLE_AUTH_PLUGIN_ID = "NativeAppleAuth";

export type NativeAppleAuthErrorCode =
  | "user_cancelled"
  | "apple_native_config_error"
  | "apple_native_token_missing"
  | "apple_native_unavailable"
  | "apple_native_exchange_not_ready"
  | "apple_native_verify_failed"
  | "apple_native_account_conflict"
  | "apple_native_token_invalid"
  | "apple_native_invalid_audience";

export type NativeAppleSignInResult = {
  provider: "apple";
  identityToken: string;
  authorizationCode?: string | null;
  nonce?: string | null;
  userIdentifier?: string | null;
  /** Display only — never use for account merge without server verify */
  email?: string | null;
  fullName?: string | null;
};

/** POST /api/auth/native/exchange — Apple request schema (STEP 2 verify) */
export type NativeAppleExchangeRequest = {
  provider: "apple";
  identityToken: string;
  authorizationCode?: string;
  nonce?: string;
  userIdentifier?: string;
};

export function buildNativeAppleExchangeRequest(
  result: NativeAppleSignInResult,
): NativeAppleExchangeRequest {
  const body: NativeAppleExchangeRequest = {
    provider: "apple",
    identityToken: result.identityToken.trim(),
  };
  const code = result.authorizationCode?.trim();
  const nonce = result.nonce?.trim();
  const userId = result.userIdentifier?.trim();
  if (code) body.authorizationCode = code;
  if (nonce) body.nonce = nonce;
  if (userId) body.userIdentifier = userId;
  return body;
}

export function parseNativeAppleExchangeBody(
  body: Record<string, unknown>,
): NativeAppleExchangeRequest | null {
  const provider = String(body.provider ?? "").trim().toLowerCase();
  if (provider !== "apple") return null;

  const identityToken = readNonEmptyString(body.identityToken ?? body.idToken);
  if (!identityToken) return null;

  const parsed: NativeAppleExchangeRequest = {
    provider: "apple",
    identityToken,
  };
  const authorizationCode = readNonEmptyString(body.authorizationCode);
  const nonce = readNonEmptyString(body.nonce);
  const userIdentifier = readNonEmptyString(body.userIdentifier);
  if (authorizationCode) parsed.authorizationCode = authorizationCode;
  if (nonce) parsed.nonce = nonce;
  if (userIdentifier) parsed.userIdentifier = userIdentifier;
  return parsed;
}

function readNonEmptyString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

export function isNativeAppleAuthErrorCode(code: string): code is NativeAppleAuthErrorCode {
  return (
    code === "user_cancelled"
    || code === "apple_native_config_error"
    || code === "apple_native_token_missing"
    || code === "apple_native_unavailable"
    || code === "apple_native_exchange_not_ready"
    || code === "apple_native_verify_failed"
    || code === "apple_native_account_conflict"
    || code === "apple_native_token_invalid"
    || code === "apple_native_invalid_audience"
  );
}

export function mapNativeApplePluginError(raw: string | undefined | null): NativeAppleAuthErrorCode {
  const code = String(raw ?? "").trim().toLowerCase();
  if (code === "user_cancelled" || code === "canceled" || code === "cancelled") {
    return "user_cancelled";
  }
  if (code === "apple_native_config_error" || code === "not_configured") {
    return "apple_native_config_error";
  }
  if (code === "apple_native_token_missing" || code === "token_missing") {
    return "apple_native_token_missing";
  }
  return "apple_native_unavailable";
}

/** iOS native Apple vs Web OAuth 분기 — unit testable */
export function shouldUseNativeAppleOAuth(provider: string, nativeAppleAvailable: boolean): boolean {
  return provider === "apple" && nativeAppleAvailable;
}
