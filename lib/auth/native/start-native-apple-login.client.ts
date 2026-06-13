"use client";

import {
  buildNativeAppleExchangeRequest,
  type NativeAppleAuthErrorCode,
} from "@/lib/auth/native/native-apple-auth-contract";
import type { NativeExchangeResponse } from "@/lib/auth/native/native-provider-contract";
import { invokeNativeAppleSignIn, NativeAppleAuthError } from "@/lib/auth/native/native-apple-auth-plugin";
import {
  endOAuthFlow,
  releaseOAuthFlowOnUserCancel,
  tryBeginOAuthFlow,
} from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { isNativeAppleLoginAvailable } from "@/lib/platform/capacitor-native";

export type NativeAppleExchangeResponse = NativeExchangeResponse;

function mapExchangeErrorToNativeAppleError(
  exchange: Extract<NativeAppleExchangeResponse, { ok: false }>,
  httpStatus?: number,
): NativeAppleAuthError {
  const code = String(exchange.errorCode ?? "").trim();
  if (code === "native_exchange_not_implemented" || code === "native_provider_not_implemented" || httpStatus === 501) {
    return new NativeAppleAuthError(
      "apple_native_exchange_not_ready",
      exchange.message ?? "Apple native exchange is not ready",
    );
  }
  if (code === "provider_account_conflict" || code === "native_exchange_account_conflict") {
    return new NativeAppleAuthError(
      "apple_native_account_conflict",
      exchange.message ?? "Apple account conflict",
    );
  }
  if (
    code === "apple_token_verify_failed"
    || code === "apple_aud_not_allowed"
    || code === "apple_token_invalid_audience"
    || code === "apple_nonce_mismatch"
  ) {
    const isAud =
      code === "apple_aud_not_allowed" || code === "apple_token_invalid_audience";
    return new NativeAppleAuthError(
      isAud ? "apple_native_invalid_audience" : "apple_native_verify_failed",
      exchange.message ?? "Apple login verification failed",
    );
  }
  if (
    code === "native_token_missing"
    || code === "native_exchange_bad_request"
    || code === "malformed_token"
    || code === "invalid_json"
  ) {
    return new NativeAppleAuthError(
      "apple_native_token_invalid",
      exchange.message ?? "Apple login token is invalid",
    );
  }
  return new NativeAppleAuthError("apple_native_unavailable", exchange.message ?? (code || "exchange_failed"));
}

/**
 * P2 STEP 1: Apple SDK token → exchange API (501 until STEP 2 verify).
 * NEVER creates Supabase session on client.
 */
export async function postNativeAppleExchange(
  body: ReturnType<typeof buildNativeAppleExchangeRequest>,
  options?: { next?: string | null },
): Promise<NativeAppleExchangeResponse> {
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
  const json = (await res.json().catch(() => null)) as NativeAppleExchangeResponse | null;
  if (!json || typeof json !== "object") {
    return { ok: false, errorCode: "invalid_response", message: "Invalid native exchange response" };
  }
  if (!json.ok) {
    return {
      ok: false,
      errorCode: json.errorCode ?? (res.status === 501 ? "native_exchange_not_implemented" : "exchange_failed"),
      message: json.message,
    };
  }
  if (json.sessionEstablished !== true) {
    return {
      ok: false,
      errorCode: "native_exchange_not_implemented",
      message: "Native exchange succeeded without session",
    };
  }
  return json;
}

export function isNativeAppleLoginStartError(code: string): code is NativeAppleAuthErrorCode {
  return (
    code === "user_cancelled"
    || code === "apple_native_config_error"
    || code === "apple_native_token_missing"
    || code === "apple_native_unavailable"
    || code === "apple_native_exchange_not_ready"
    || code === "apple_native_verify_failed"
    || code === "apple_native_account_conflict"
    || code === "apple_native_token_invalid"
  );
}

/**
 * iOS Capacitor — AuthenticationServices via NativeAppleAuth plugin.
 * Web / Android: caller must use Web OAuth (`startOAuthLogin`).
 */
export async function startNativeAppleLogin(input?: { next?: string | null }): Promise<void> {
  if (!isNativeAppleLoginAvailable()) {
    throw new NativeAppleAuthError("apple_native_unavailable");
  }

  const flow = tryBeginOAuthFlow("apple");
  if (!flow.ok) {
    const err = new Error("OAuth가 이미 진행 중입니다.");
    err.name = "oauth_flow_in_flight";
    throw err;
  }

  try {
    logOAuthNativeEvent("apple_native_started", { next: input?.next ?? null });
    const signInResult = await invokeNativeAppleSignIn();
    logOAuthNativeEvent("apple_native_success", {
      hasIdentityToken: Boolean(signInResult.identityToken),
      hasUserIdentifier: Boolean(signInResult.userIdentifier),
    });

    const exchangeBody = buildNativeAppleExchangeRequest(signInResult);
    const exchange = await postNativeAppleExchange(exchangeBody, { next: input?.next ?? null });

    if (!exchange.ok) {
      throw mapExchangeErrorToNativeAppleError(exchange);
    }

    logOAuthNativeEvent("apple_native_exchange_ok", {
      signupComplete: exchange.signupComplete ?? null,
      redirectTo: exchange.redirectTo ?? null,
    });
    endOAuthFlow("apple");
    if (exchange.redirectTo?.trim()) {
      window.location.assign(exchange.redirectTo.trim());
    }
  } catch (error) {
    if (error instanceof NativeAppleAuthError && error.code === "user_cancelled") {
      releaseOAuthFlowOnUserCancel();
      throw error;
    }
    flow.release();
    endOAuthFlow("apple");
    throw error;
  }
}
