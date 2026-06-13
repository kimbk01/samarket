"use client";

import {
  buildNativeGoogleExchangeRequest,
  type NativeGoogleAuthErrorCode,
} from "@/lib/auth/native/native-google-auth-contract";
import type { NativeExchangeResponse } from "@/lib/auth/native/native-provider-contract";
import {
  invokeNativeGoogleRecoverSignInIfPending,
  invokeNativeGoogleSignIn,
  NativeGoogleAuthError,
} from "@/lib/auth/native/native-google-auth-plugin";
import {
  endOAuthFlow,
  releaseOAuthFlowOnUserCancel,
  tryBeginOAuthFlow,
} from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { clearStoredLoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { isNativeGoogleLoginAvailable } from "@/lib/platform/capacitor-native";

export type NativeGoogleExchangeResponse = NativeExchangeResponse;

let googleNativeRecoverInFlight = false;

function mapExchangeErrorToNativeGoogleError(
  exchange: Extract<NativeGoogleExchangeResponse, { ok: false }>,
): NativeGoogleAuthError {
  const code = String(exchange.errorCode ?? "").trim();
  if (
    code === "native_provider_not_implemented"
    || code === "google_native_exchange_disabled"
    || code === "native_exchange_session_unavailable"
    || code === "google_native_session_failed"
    || code === "native_exchange_not_implemented"
  ) {
    return new NativeGoogleAuthError(
      "google_native_exchange_not_ready",
      exchange.message ?? "Google native exchange is not ready",
    );
  }
  if (code === "provider_account_conflict" || code === "native_exchange_account_conflict") {
    return new NativeGoogleAuthError(
      "google_native_account_conflict",
      exchange.message ?? "Google account conflict",
    );
  }
  if (
    code === "native_exchange_verify_failed"
    || code === "google_token_verify_failed"
    || code === "google_token_invalid_audience"
  ) {
    return new NativeGoogleAuthError(
      "google_native_verify_failed",
      exchange.message ?? "Google login verification failed",
    );
  }
  if (code === "native_exchange_bad_request" || code === "google_token_missing" || code === "invalid_json") {
    return new NativeGoogleAuthError(
      "google_native_token_invalid",
      exchange.message ?? "Google login token is invalid",
    );
  }
  return new NativeGoogleAuthError("google_native_unavailable", exchange.message ?? (code || "exchange_failed"));
}

export async function postNativeGoogleExchange(
  body: ReturnType<typeof buildNativeGoogleExchangeRequest>,
  options?: { next?: string | null },
): Promise<NativeGoogleExchangeResponse> {
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
  const json = (await res.json().catch(() => null)) as NativeGoogleExchangeResponse | null;
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

async function completeNativeGoogleSession(input: {
  signInResult: { idToken: string };
  next?: string | null;
  recovered?: boolean;
}): Promise<void> {
  const exchangeBody = buildNativeGoogleExchangeRequest({
    provider: "google",
    idToken: input.signInResult.idToken,
  });
  const exchange = await postNativeGoogleExchange(exchangeBody, { next: input.next ?? null });

  if (!exchange.ok) {
    console.error("[oauth] google_native_exchange_failed", {
      errorCode: exchange.errorCode,
      message: exchange.message,
      recovered: input.recovered ?? false,
    });
    throw mapExchangeErrorToNativeGoogleError(exchange);
  }

  logOAuthNativeEvent("google_native_exchange_ok", {
    signupComplete: exchange.signupComplete ?? null,
    redirectTo: exchange.redirectTo ?? null,
    recovered: input.recovered ?? false,
  });
  endOAuthFlow("google");
  clearStoredLoginRequiredDetail();
  if (exchange.redirectTo?.trim()) {
    window.location.replace(exchange.redirectTo.trim());
  }
}

export function isNativeGoogleLoginStartError(code: string): code is NativeGoogleAuthErrorCode {
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

/**
 * Google 계정 UI 복귀·프로세스 재시작 후 native pending 이 남아 있으면 silentSignIn 으로 exchange 를 이어간다.
 */
export async function recoverNativeGoogleLoginIfPending(): Promise<boolean> {
  if (!isNativeGoogleLoginAvailable() || googleNativeRecoverInFlight) return false;

  googleNativeRecoverInFlight = true;
  try {
    const recovered = await invokeNativeGoogleRecoverSignInIfPending();
    if (!recovered) return false;

    const flow = tryBeginOAuthFlow("google");
    if (!flow.ok) return false;

    try {
      logOAuthNativeEvent("google_native_recover_started", { next: recovered.next ?? null });
      await completeNativeGoogleSession({
        signInResult: recovered,
        next: recovered.next ?? null,
        recovered: true,
      });
      return true;
    } catch (error) {
      flow.release();
      endOAuthFlow("google");
      console.error("[oauth] google_native_recover_exchange_failed", error);
      return false;
    }
  } finally {
    googleNativeRecoverInFlight = false;
  }
}

/**
 * Android Capacitor — Google Sign-In via NativeGoogleAuth plugin.
 */
export async function startNativeGoogleLogin(input?: { next?: string | null }): Promise<void> {
  if (!isNativeGoogleLoginAvailable()) {
    throw new NativeGoogleAuthError("google_native_unavailable");
  }

  const flow = tryBeginOAuthFlow("google");
  if (!flow.ok) {
    const err = new Error("OAuth가 이미 진행 중입니다.");
    err.name = "oauth_flow_in_flight";
    throw err;
  }

  try {
    logOAuthNativeEvent("google_native_started", { next: input?.next ?? null });
    const signInResult = await invokeNativeGoogleSignIn({ next: input?.next ?? null });
    logOAuthNativeEvent("google_native_success", {
      hasIdToken: Boolean(signInResult.idToken),
      hasUserId: Boolean(signInResult.userId),
      recovered: Boolean(signInResult.recovered),
    });

    await completeNativeGoogleSession({
      signInResult,
      next: signInResult.next ?? input?.next ?? null,
      recovered: signInResult.recovered,
    });
  } catch (error) {
    if (error instanceof NativeGoogleAuthError && error.code === "user_cancelled") {
      releaseOAuthFlowOnUserCancel();
      throw error;
    }
    flow.release();
    endOAuthFlow("google");
    throw error;
  }
}
