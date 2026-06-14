import { NativeAppleAuthError } from "@/lib/auth/native/native-apple-auth-plugin";
import { NativeGoogleAuthError } from "@/lib/auth/native/native-google-auth-plugin";
import { NativeKakaoAuthError } from "@/lib/auth/native/native-kakao-auth-plugin";
import { NativeProviderLoginError } from "@/lib/auth/native/start-native-provider-login.client";

export function resolveNativeProviderLoginErrorCode(err: unknown): string {
  if (err instanceof NativeProviderLoginError) return err.code;
  if (err instanceof NativeKakaoAuthError) return err.code;
  if (err instanceof NativeAppleAuthError) return err.code;
  if (err instanceof NativeGoogleAuthError) return err.code;
  if (err instanceof Error) return err.name || err.message || "oauth_start_failed";
  return "oauth_start_failed";
}

function safeNativeAuthFailureReason(
  err: NativeAppleAuthError | NativeKakaoAuthError | NativeGoogleAuthError,
): string {
  const message = err.message?.trim() || "";
  if (!message || /id_token|access_token|identitytoken=/i.test(message)) {
    return err.code;
  }
  return message;
}

/** token/code/id_token/access_token/raw body 미포함 — code·reason만. */
export function summarizeOAuthStartFailure(err: unknown): { code: string; reason: string } {
  const code = resolveNativeProviderLoginErrorCode(err);
  if (err instanceof NativeAppleAuthError || err instanceof NativeKakaoAuthError || err instanceof NativeGoogleAuthError) {
    return { code, reason: safeNativeAuthFailureReason(err) };
  }
  if (err instanceof NativeProviderLoginError) {
    return { code, reason: err.message || code };
  }
  if (err instanceof Error) {
    return { code, reason: err.message || code };
  }
  return { code, reason: code };
}

export function isNativeProviderCancelError(err: unknown): boolean {
  if (err instanceof NativeKakaoAuthError && err.code === "user_cancelled") return true;
  if (err instanceof NativeAppleAuthError && err.code === "user_cancelled") return true;
  if (err instanceof NativeGoogleAuthError && err.code === "user_cancelled") return true;
  return false;
}

/** conflict 모달이 이미 열린 경우 — generic OAuth 에러 문구 중복 표시 금지 */
export function isNativeProviderEmailConflictError(err: unknown): boolean {
  if (err instanceof NativeGoogleAuthError && err.code === "google_native_email_conflict") return true;
  if (err instanceof NativeKakaoAuthError && err.code === "kakao_native_email_conflict") return true;
  if (err instanceof NativeAppleAuthError && err.code === "apple_native_email_conflict") return true;
  return false;
}
