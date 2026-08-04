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
import {
  authLifecycleExchangeHeaders,
  bumpAuthLifecycleCounter,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import { syncCommonClientSessionAfterAuth } from "@/lib/auth/completion/sync-common-client-session.client";
import { openProviderEmailConflictFromExchange } from "@/lib/auth/provider-identity/provider-email-conflict.client";
import { clearStoredLoginRequiredDetail } from "@/lib/auth/require-auth-action";
import type { FinishClientAuthLoginTermsHandoff } from "@/lib/auth/finish-client-auth-login.client";
import { isNativeAppleLoginAvailable } from "@/lib/platform/capacitor-native";

export type NativeAppleExchangeResponse = NativeExchangeResponse;

function mapExchangeErrorToNativeAppleError(
  exchange: Extract<NativeAppleExchangeResponse, { ok: false }>,
  httpStatus?: number,
): NativeAppleAuthError {
  const code = String(exchange.errorCode ?? "").trim();
  if (
    code === "native_exchange_not_implemented"
    || code === "native_provider_not_implemented"
    || code === "native_exchange_session_unavailable"
    || httpStatus === 501
  ) {
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
 * Native Apple SDK token → server verify → Supabase session (POST /api/auth/native/exchange).
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
  bumpAuthLifecycleCounter("nativeExchange");
  markAuthLifecycleStage("exchange_requested", { provider: "apple", http: "POST /api/auth/native/exchange" });
  const res = await fetch("/api/auth/native/exchange", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authLifecycleExchangeHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as NativeAppleExchangeResponse | null;
  if (!json || typeof json !== "object") {
    markAuthLifecycleStage("exchange_requested", { provider: "apple", httpStatus: res.status, parseOk: false });
    return { ok: false, errorCode: "invalid_response", message: "Invalid native exchange response" };
  }
  if (!json.ok) {
    const failure: Extract<NativeAppleExchangeResponse, { ok: false }> = {
      ok: false,
      errorCode: json.errorCode ?? (res.status === 501 ? "native_exchange_not_implemented" : "exchange_failed"),
      message: json.message,
    };
    if (json.conflict) failure.conflict = json.conflict;
    markAuthLifecycleStage("exchange_requested", {
      provider: "apple",
      httpStatus: res.status,
      errorCode: failure.errorCode,
      ok: false,
    });
    return failure;
  }
  if (json.sessionEstablished !== true) {
    markAuthLifecycleStage("exchange_requested", {
      provider: "apple",
      httpStatus: res.status,
      sessionEstablished: false,
    });
    return {
      ok: false,
      errorCode: "native_exchange_not_implemented",
      message: "Native exchange succeeded without session",
    };
  }
  markAuthLifecycleStage("server_session_established", {
    provider: "apple",
    httpStatus: res.status,
    signupComplete: json.signupComplete ?? null,
    needsTermsAgreement: json.needsTermsAgreement ?? null,
  });
  markAuthLifecycleStage("cookie_handoff_completed", {
    provider: "apple",
    note: "exchange_2xx_set_cookie_assumed",
  });

  // Slice 2-2: same client-session contract as Google/Kakao native exchange.
  // Navigation stays in finishClientAuthLogin → runCommonAuthClientCompletion (no dual completion).
  const synced = await syncCommonClientSessionAfterAuth();
  if (!synced) {
    markAuthLifecycleStage("client_session_visible", {
      provider: "apple",
      primed: false,
      via: "syncCommonClientSessionAfterAuth",
    });
    return {
      ok: false,
      errorCode: "native_exchange_session_unavailable",
      message: "Client session was not established after Apple exchange",
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
    || code === "apple_native_email_conflict"
    || code === "apple_native_token_invalid"
  );
}

export type NativeAppleLoginHandoff = FinishClientAuthLoginTermsHandoff & {
  redirectTo: string | null;
};

function buildNativeAppleLoginHandoff(
  exchange: Extract<NativeAppleExchangeResponse, { ok: true }>,
): NativeAppleLoginHandoff {
  return {
    redirectTo: exchange.redirectTo?.trim() ?? null,
    needsTermsAgreement: exchange.needsTermsAgreement,
    signupComplete: exchange.signupComplete,
    consentComplete: exchange.needsTermsAgreement === false || exchange.signupComplete === true,
  };
}

/**
 * iOS Capacitor — AuthenticationServices via NativeAppleAuth plugin.
 * Web / Android: caller must use Web OAuth (`startOAuthLogin`).
 */
export async function startNativeAppleLogin(input?: {
  next?: string | null;
}): Promise<NativeAppleLoginHandoff> {
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
    markAuthLifecycleStage("provider_ui_presented", { provider: "apple", via: "NativeAppleAuth.signIn" });
    const signInResult = await invokeNativeAppleSignIn();
    logOAuthNativeEvent("apple_native_success", {
      hasIdentityToken: Boolean(signInResult.identityToken),
      hasUserIdentifier: Boolean(signInResult.userIdentifier),
    });
    markAuthLifecycleStage("provider_credential_received", {
      provider: "apple",
      hasIdentityToken: Boolean(signInResult.identityToken),
      hasAuthorizationCode: Boolean(signInResult.authorizationCode),
      hasFullName: Boolean(signInResult.fullName),
    });

    const exchangeBody = buildNativeAppleExchangeRequest(signInResult);
    const exchange = await postNativeAppleExchange(exchangeBody, { next: input?.next ?? null });

    if (!exchange.ok) {
      if (openProviderEmailConflictFromExchange(exchange)) {
        endOAuthFlow("apple");
        throw new NativeAppleAuthError("apple_native_email_conflict", exchange.message);
      }
      throw mapExchangeErrorToNativeAppleError(exchange);
    }

    logOAuthNativeEvent("apple_native_exchange_success", {
      signupComplete: exchange.signupComplete ?? null,
      needsTermsAgreement: exchange.needsTermsAgreement ?? null,
      redirectTo: exchange.redirectTo ?? null,
    });
    endOAuthFlow("apple");
    clearStoredLoginRequiredDetail();
    return buildNativeAppleLoginHandoff(exchange);
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
