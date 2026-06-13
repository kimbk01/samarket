import type { NativeExchangeFailure, NativeExchangeProvider } from "@/lib/auth/native/native-exchange-types.server";

export function nativeExchangeBadRequest(
  message: string,
  errorCode = "native_exchange_bad_request",
): NativeExchangeFailure {
  return { ok: false, errorCode, message, status: 400 };
}

export function nativeExchangeVerifyFailed(message: string): NativeExchangeFailure {
  return {
    ok: false,
    errorCode: "native_exchange_verify_failed",
    message,
    status: 401,
  };
}

export function nativeExchangeAccountConflict(message: string): NativeExchangeFailure {
  return {
    ok: false,
    errorCode: "native_exchange_account_conflict",
    message,
    status: 409,
  };
}

export function nativeProviderNotImplemented(provider: NativeExchangeProvider | string): NativeExchangeFailure {
  return {
    ok: false,
    errorCode: "native_provider_not_implemented",
    message: `${provider} native SDK token exchange is not implemented`,
    status: 501,
  };
}

export function invalidNativeExchangeProvider(): NativeExchangeFailure {
  return nativeExchangeBadRequest(
    "Native exchange provider must be apple, kakao, google, or facebook.",
    "invalid_provider",
  );
}

/** Supabase service role / session infra missing */
export function nativeExchangeSessionUnavailable(message: string): NativeExchangeFailure {
  return {
    ok: false,
    errorCode: "native_exchange_session_unavailable",
    message,
    status: 503,
  };
}
