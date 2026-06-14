"use client";

import { buildNativeGoogleExchangeRequest } from "@/lib/auth/native/native-google-auth-contract";
import type { NativeExchangeResponse } from "@/lib/auth/native/native-provider-contract";
import {
  invokeNativeGoogleRecoverSignInIfPending,
  invokeNativeGoogleSignIn,
  NativeGoogleAuthError,
  revokeNativeGoogleSessionIfAvailable,
} from "@/lib/auth/native/native-google-auth-plugin";
import {
  mapNativeExchangeFailure,
  postNativeProviderExchange,
} from "@/lib/auth/native/post-native-exchange.client";
import {
  endOAuthFlow,
  releaseOAuthFlowOnUserCancel,
  tryBeginOAuthFlow,
} from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { clearStoredLoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { isNativeGoogleLoginAvailable } from "@/lib/platform/capacitor-native";

export type NativeGoogleExchangeResponse = NativeExchangeResponse;

let googleNativeRecoverInFlight = false;

function throwNativeGoogleExchangeError(exchange: Extract<NativeGoogleExchangeResponse, { ok: false }>): never {
  const mapped = mapNativeExchangeFailure("google", exchange);
  throw new NativeGoogleAuthError(mapped.code, mapped.message);
}

async function abortGoogleNativeRecoverPending(reason: string): Promise<void> {
  logOAuthNativeEvent("google_native_recover_aborted", { reason });
  await revokeNativeGoogleSessionIfAvailable();
}

function finishNativeGoogleRecoverNavigation(redirectTo: string | null | undefined): void {
  const target = redirectTo?.trim() || POST_LOGIN_PATH;
  window.location.replace(target);
}

/**
 * Google 계정 UI 복귀 시 startNativeGoogleLogin 의 OAuth lock 이 아직 잡혀 있을 수 있다.
 * 같은 provider(google) in-flight 는 “복구가 원래 시도를 마무리하는 것”이므로 abort 하지 않는다.
 */
export function shouldAbortGoogleNativeRecoverForOAuthLock(inFlightProvider: string): boolean {
  return inFlightProvider !== "google";
}

async function completeNativeGoogleSession(input: {
  signInResult: { idToken: string };
  next?: string | null;
  recovered?: boolean;
}): Promise<{ redirectTo: string | null }> {
  const exchangeBody = buildNativeGoogleExchangeRequest({
    provider: "google",
    idToken: input.signInResult.idToken,
  });
  const exchange = await postNativeProviderExchange(exchangeBody, { next: input.next ?? null });

  if (!exchange.ok) {
    logOAuthNativeEvent("google_native_exchange_failed", {
      errorCode: exchange.errorCode,
      message: exchange.message,
      recovered: input.recovered ?? false,
    });
    throwNativeGoogleExchangeError(exchange);
  }

  logOAuthNativeEvent("google_native_exchange_ok", {
    signupComplete: exchange.signupComplete ?? null,
    redirectTo: exchange.redirectTo ?? null,
    recovered: input.recovered ?? false,
  });
  endOAuthFlow("google");
  clearStoredLoginRequiredDetail();
  return { redirectTo: exchange.redirectTo?.trim() ?? null };
}

/**
 * Google 계정 UI 복귀·프로세스 재시작 후 exchange pending 만 복구한다.
 * recover 실패·exchange 실패 시 pending 을 정리해 silentSignIn 자동 로그인을 막는다.
 */
export async function recoverNativeGoogleLoginIfPending(): Promise<boolean> {
  if (!isNativeGoogleLoginAvailable() || googleNativeRecoverInFlight) return false;

  googleNativeRecoverInFlight = true;
  try {
    const recovered = await invokeNativeGoogleRecoverSignInIfPending();
    if (!recovered) return false;

    const flow = tryBeginOAuthFlow("google");
    const releaseFlow = flow.ok ? flow.release : null;
    if (!flow.ok && shouldAbortGoogleNativeRecoverForOAuthLock(flow.inFlightProvider)) {
      await abortGoogleNativeRecoverPending("oauth_flow_in_flight");
      return false;
    }

    try {
      logOAuthNativeEvent("google_native_recover_started", {
        next: recovered.next ?? null,
        completingInFlightGoogleFlow: !flow.ok,
      });
      const result = await completeNativeGoogleSession({
        signInResult: recovered,
        next: recovered.next ?? null,
        recovered: true,
      });
      finishNativeGoogleRecoverNavigation(result.redirectTo);
      return true;
    } catch (error) {
      releaseFlow?.();
      endOAuthFlow("google");
      await abortGoogleNativeRecoverPending("recover_exchange_failed");
      logOAuthNativeEvent("google_native_recover_exchange_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  } finally {
    googleNativeRecoverInFlight = false;
  }
}

/**
 * Android Capacitor — Google Sign-In via NativeGoogleAuth plugin.
 */
export async function startNativeGoogleLogin(input?: {
  next?: string | null;
}): Promise<{ redirectTo: string | null }> {
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

    return completeNativeGoogleSession({
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
