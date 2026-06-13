/**
 * P2 STEP 3 — Kakao Native Login client contract.
 *
 * SECURITY (DO NOT):
 * - trust accessToken on client for session creation
 * - merge accounts by email alone
 * - use email as primary link key — server uses provider_user_id from Kakao REST verify
 */

export const NATIVE_KAKAO_AUTH_PLUGIN_ID = "NativeKakaoAuth";

export type NativeKakaoAuthErrorCode =
  | "user_cancelled"
  | "kakao_native_config_error"
  | "kakao_native_key_hash_required"
  | "kakao_native_token_missing"
  | "kakao_native_unavailable"
  | "kakao_native_exchange_not_ready"
  | "kakao_native_verify_failed"
  | "kakao_native_account_conflict"
  | "kakao_native_token_invalid";

export type NativeKakaoSignInResult = {
  provider: "kakao";
  accessToken: string;
  idToken?: string | null;
  refreshToken?: string | null;
  userId?: string | null;
};

export type NativeKakaoExchangeRequest = {
  provider: "kakao";
  accessToken: string;
  idToken?: string;
};

export function buildNativeKakaoExchangeRequest(
  result: NativeKakaoSignInResult,
): NativeKakaoExchangeRequest {
  const body: NativeKakaoExchangeRequest = {
    provider: "kakao",
    accessToken: result.accessToken.trim(),
  };
  const idToken = result.idToken?.trim();
  if (idToken) body.idToken = idToken;
  return body;
}

export function extractNativeKakaoPluginRejectRaw(error: unknown): string {
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

export function mapNativeKakaoPluginError(raw: string | undefined | null): NativeKakaoAuthErrorCode {
  const code = String(raw ?? "").trim().toLowerCase();
  if (code === "user_cancelled" || code === "canceled" || code === "cancelled") {
    return "user_cancelled";
  }
  if (code === "kakao_native_config_error" || code === "not_configured") {
    return "kakao_native_config_error";
  }
  if (
    code === "kakao_native_key_hash_required"
    || code.includes("kakaotalk is installed")
    || code.includes("keyhash")
    || code.includes("key hash")
    || code.includes("invalidkeyhash")
  ) {
    return "kakao_native_key_hash_required";
  }
  if (code === "kakao_native_token_missing" || code === "token_missing") {
    return "kakao_native_token_missing";
  }
  if (
    code === "kakao_native_unavailable"
    || code.includes("unimplemented")
    || code.includes("not implemented")
  ) {
    return "kakao_native_unavailable";
  }
  return "kakao_native_unavailable";
}

/** Android/iOS native Kakao vs Web OAuth 분기 */
export function shouldUseNativeKakaoOAuth(provider: string, nativeKakaoAvailable: boolean): boolean {
  return provider === "kakao" && nativeKakaoAvailable;
}
