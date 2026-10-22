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

/** snake_case 오류 코드 (예: google_native_config_error, user_cancelled) */
export function looksLikeNativePluginErrorCode(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

/**
 * Capacitor Android `PluginCall.reject(msg, code)` — 첫 인자가 message, 둘째가 code 다.
 * DIBAY 플러그인은 `reject("google_native_…", "설명")` 순서로 호출해 JS 에는 code 자리에 설명,
 * message 자리에 코드가 온다. 두 필드 중 코드 형태인 값을 고르고, 없으면 설명 원문을 돌려준다.
 */
export function extractNativePluginRejectRaw(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = String(record.code ?? "").trim();
    const message = String(record.message ?? record.errorMessage ?? "").trim();
    if (looksLikeNativePluginErrorCode(code)) return code;
    if (looksLikeNativePluginErrorCode(message)) return message;
    if (code) return code;
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

/**
 * Google Sign-In 상태 12501(SIGN_IN_CANCELLED) = 사용자가 계정 선택 화면을 닫음.
 * 플러그인은 이를 결과 파싱 오류로 google_native_config_error 와 함께 넘기므로(설명에 "12501")
 * 코드보다 먼저 확인해 취소로 처리한다.
 */
export function isGoogleSignInCancelledReject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const text = `${String(record.code ?? "")} ${String(record.message ?? record.errorMessage ?? "")}`;
  return /(^|\D)12501(\D|$)/.test(text);
}

export function extractNativeGooglePluginRejectRaw(error: unknown): string {
  if (isGoogleSignInCancelledReject(error)) return "user_cancelled";
  return extractNativePluginRejectRaw(error);
}

export function mapNativeGooglePluginError(raw: string | undefined | null): NativeGoogleAuthErrorCode {
  const code = String(raw ?? "").trim().toLowerCase();
  if (
    code === "user_cancelled"
    || code === "canceled"
    || code === "cancelled"
    // 새 로그인 요청이 이전 고아 호출을 대체 — 이전 대기자는 조용히 종료 (실패 문구 금지)
    || code === "google_native_superseded"
  ) {
    return "user_cancelled";
  }
  if (
    code === "google_native_config_error"
    || code === "not_configured"
    // 설명 원문으로만 온 경우 (구 바이너리·Play services 오류): DEVELOPER_ERROR(10) = SHA-1/패키지/클라이언트 불일치
    || code.includes("developer_error")
    || code.includes("not configured")
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
