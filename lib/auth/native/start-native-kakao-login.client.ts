"use client";

import {
  buildNativeKakaoExchangeRequest,
  type NativeKakaoAuthErrorCode,
} from "@/lib/auth/native/native-kakao-auth-contract";
import type { NativeExchangeResponse } from "@/lib/auth/native/native-provider-contract";
import { invokeNativeKakaoSignIn, NativeKakaoAuthError } from "@/lib/auth/native/native-kakao-auth-plugin";
import {
  endOAuthFlow,
  releaseOAuthFlowOnUserCancel,
  tryBeginOAuthFlow,
} from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { clearStoredLoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { isNativeKakaoLoginAvailable } from "@/lib/platform/capacitor-native";

export type NativeKakaoExchangeResponse = NativeExchangeResponse;

function mapExchangeErrorToNativeKakaoError(
  exchange: Extract<NativeKakaoExchangeResponse, { ok: false }>,
): NativeKakaoAuthError {
  const code = String(exchange.errorCode ?? "").trim();
  if (
    code === "native_provider_not_implemented"
    || code === "kakao_native_exchange_disabled"
    || code === "native_exchange_session_unavailable"
    || code === "kakao_native_session_failed"
    || code === "native_exchange_not_implemented"
  ) {
    return new NativeKakaoAuthError(
      "kakao_native_exchange_not_ready",
      exchange.message ?? "Kakao native exchange is not ready",
    );
  }
  if (code === "provider_account_conflict" || code === "native_exchange_account_conflict") {
    return new NativeKakaoAuthError(
      "kakao_native_account_conflict",
      exchange.message ?? "Kakao account conflict",
    );
  }
  if (code === "native_exchange_verify_failed" || code === "kakao_token_verify_failed") {
    return new NativeKakaoAuthError(
      "kakao_native_verify_failed",
      exchange.message ?? "Kakao login verification failed",
    );
  }
  if (code === "native_exchange_bad_request" || code === "kakao_token_missing" || code === "invalid_json") {
    return new NativeKakaoAuthError(
      "kakao_native_token_invalid",
      exchange.message ?? "Kakao login token is invalid",
    );
  }
  return new NativeKakaoAuthError("kakao_native_unavailable", exchange.message ?? (code || "exchange_failed"));
}

export async function postNativeKakaoExchange(
  body: ReturnType<typeof buildNativeKakaoExchangeRequest>,
  options?: { next?: string | null },
): Promise<NativeKakaoExchangeResponse> {
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
  const json = (await res.json().catch(() => null)) as NativeKakaoExchangeResponse | null;
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
  return json;
}

export function isNativeKakaoLoginStartError(code: string): code is NativeKakaoAuthErrorCode {
  return (
    code === "user_cancelled"
    || code === "kakao_native_config_error"
    || code === "kakao_native_key_hash_required"
    || code === "kakao_native_token_missing"
    || code === "kakao_native_unavailable"
    || code === "kakao_native_exchange_not_ready"
    || code === "kakao_native_verify_failed"
    || code === "kakao_native_account_conflict"
    || code === "kakao_native_token_invalid"
  );
}

/**
 * Android/iOS Capacitor — Kakao SDK via NativeKakaoAuth plugin.
 * Web: caller must use Web OAuth (`startOAuthLogin`).
 */
export async function startNativeKakaoLogin(input?: { next?: string | null }): Promise<void> {
  if (!isNativeKakaoLoginAvailable()) {
    throw new NativeKakaoAuthError("kakao_native_unavailable");
  }

  const flow = tryBeginOAuthFlow("kakao");
  if (!flow.ok) {
    const err = new Error("OAuth가 이미 진행 중입니다.");
    err.name = "oauth_flow_in_flight";
    throw err;
  }

  try {
    logOAuthNativeEvent("kakao_native_started", { next: input?.next ?? null });
    const signInResult = await invokeNativeKakaoSignIn();
    logOAuthNativeEvent("kakao_native_success", {
      hasAccessToken: Boolean(signInResult.accessToken),
      hasUserId: Boolean(signInResult.userId),
    });

    const exchangeBody = buildNativeKakaoExchangeRequest(signInResult);
    const exchange = await postNativeKakaoExchange(exchangeBody, { next: input?.next ?? null });

    if (!exchange.ok) {
      throw mapExchangeErrorToNativeKakaoError(exchange);
    }

    logOAuthNativeEvent("kakao_native_exchange_ok", {
      signupComplete: exchange.signupComplete ?? null,
      redirectTo: exchange.redirectTo ?? null,
    });
    endOAuthFlow("kakao");
    clearStoredLoginRequiredDetail();
    if (exchange.redirectTo?.trim()) {
      window.location.replace(exchange.redirectTo.trim());
    }
  } catch (error) {
    if (error instanceof NativeKakaoAuthError && error.code === "user_cancelled") {
      releaseOAuthFlowOnUserCancel();
      throw error;
    }
    flow.release();
    endOAuthFlow("kakao");
    throw error;
  }
}
