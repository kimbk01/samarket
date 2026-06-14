"use client";

import { syncClientSessionAfterNativeExchange } from "@/lib/auth/native/sync-client-session-after-native-exchange.client";
import type { NativeKakaoAuthErrorCode } from "@/lib/auth/native/native-kakao-auth-contract";
import type { NativeGoogleAuthErrorCode } from "@/lib/auth/native/native-google-auth-contract";
import type { NativeExchangeResponse } from "@/lib/auth/native/native-provider-contract";

export type NativeExchangeClientProvider = "google" | "kakao";

export type MappedNativeExchangeFailure =
  | { provider: "google"; code: NativeGoogleAuthErrorCode; message: string }
  | { provider: "kakao"; code: NativeKakaoAuthErrorCode; message: string };

function isExchangeNotReadyCode(provider: NativeExchangeClientProvider, raw: string): boolean {
  return (
    raw === "native_provider_not_implemented"
    || raw === "native_exchange_session_unavailable"
    || raw === "native_exchange_not_implemented"
    || raw === `${provider}_native_exchange_disabled`
    || raw === `${provider}_native_session_failed`
  );
}

/** `/api/auth/native/exchange` 실패 → provider별 클라이언트 에러 코드 */
export function mapNativeExchangeFailure(
  provider: "google",
  exchange: Extract<NativeExchangeResponse, { ok: false }>,
): { provider: "google"; code: NativeGoogleAuthErrorCode; message: string };
export function mapNativeExchangeFailure(
  provider: "kakao",
  exchange: Extract<NativeExchangeResponse, { ok: false }>,
): { provider: "kakao"; code: NativeKakaoAuthErrorCode; message: string };
export function mapNativeExchangeFailure(
  provider: NativeExchangeClientProvider,
  exchange: Extract<NativeExchangeResponse, { ok: false }>,
): MappedNativeExchangeFailure {
  const raw = String(exchange.errorCode ?? "").trim();
  const fallbackMessage = exchange.message ?? (raw || "exchange_failed");

  if (isExchangeNotReadyCode(provider, raw)) {
    return {
      provider,
      code: `${provider}_native_exchange_not_ready`,
      message:
        exchange.message
        ?? (provider === "google" ? "Google native exchange is not ready" : "Kakao native exchange is not ready"),
    } as MappedNativeExchangeFailure;
  }
  if (raw === "provider_account_conflict" || raw === "native_exchange_account_conflict") {
    return {
      provider,
      code: `${provider}_native_account_conflict`,
      message:
        exchange.message
        ?? (provider === "google" ? "Google account conflict" : "Kakao account conflict"),
    } as MappedNativeExchangeFailure;
  }
  if (
    raw === "native_exchange_verify_failed"
    || raw === `${provider}_token_verify_failed`
    || (provider === "google" && raw === "google_token_invalid_audience")
  ) {
    return {
      provider,
      code: `${provider}_native_verify_failed`,
      message:
        exchange.message
        ?? (provider === "google" ? "Google login verification failed" : "Kakao login verification failed"),
    } as MappedNativeExchangeFailure;
  }
  if (
    raw === "native_exchange_bad_request"
    || raw === `${provider}_token_missing`
    || raw === "invalid_json"
  ) {
    return {
      provider,
      code: `${provider}_native_token_invalid`,
      message:
        exchange.message
        ?? (provider === "google" ? "Google login token is invalid" : "Kakao login token is invalid"),
    } as MappedNativeExchangeFailure;
  }
  if (raw === "account_withdrawn") {
    return {
      provider,
      code: `${provider}_native_unavailable`,
      message:
        exchange.message
        ?? "This account was withdrawn. Please contact support or sign up again.",
    } as MappedNativeExchangeFailure;
  }
  if (raw === "profile_ensure_failed") {
    return {
      provider,
      code: `${provider}_native_unavailable`,
      message: exchange.message ?? "Profile sync failed after login",
    } as MappedNativeExchangeFailure;
  }
  return {
    provider,
    code: `${provider}_native_unavailable`,
    message: fallbackMessage,
  } as MappedNativeExchangeFailure;
}

export async function postNativeProviderExchange(
  body: Record<string, unknown>,
  options?: { next?: string | null },
): Promise<NativeExchangeResponse> {
  const payload: Record<string, unknown> = { ...body };
  if (options?.next?.trim()) {
    payload.next = options.next.trim();
  }
  const res = await fetch("/api/auth/native/exchange", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as NativeExchangeResponse | null;
  if (!json || typeof json !== "object") {
    return { ok: false, errorCode: "invalid_response", message: "Invalid native exchange response" };
  }
  if (!json.ok) {
    return {
      ok: false,
      errorCode: json.errorCode ?? (res.status === 501 ? "native_provider_not_implemented" : "exchange_failed"),
      message: json.message,
    };
  }
  if (json.sessionEstablished !== true) {
    return {
      ok: false,
      errorCode: "native_provider_not_implemented",
      message: "Native exchange succeeded without session",
    };
  }
  await syncClientSessionAfterNativeExchange();
  return json;
}
