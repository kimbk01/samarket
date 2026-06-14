"use client";

import { buildNativeKakaoExchangeRequest } from "@/lib/auth/native/native-kakao-auth-contract";
import type { NativeExchangeResponse } from "@/lib/auth/native/native-provider-contract";
import { invokeNativeKakaoSignIn, NativeKakaoAuthError } from "@/lib/auth/native/native-kakao-auth-plugin";
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
import { clearStoredLoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { isNativeKakaoLoginAvailable } from "@/lib/platform/capacitor-native";

export type NativeKakaoExchangeResponse = NativeExchangeResponse;

function throwNativeKakaoExchangeError(exchange: Extract<NativeKakaoExchangeResponse, { ok: false }>): never {
  const mapped = mapNativeExchangeFailure("kakao", exchange);
  throw new NativeKakaoAuthError(mapped.code, mapped.message);
}

/**
 * Android/iOS Capacitor — Kakao SDK via NativeKakaoAuth plugin.
 * Web: caller must use Web OAuth (`startOAuthLogin`).
 */
export async function startNativeKakaoLogin(input?: {
  next?: string | null;
}): Promise<{ redirectTo: string | null }> {
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
    const exchange = await postNativeProviderExchange(exchangeBody, { next: input?.next ?? null });

    if (!exchange.ok) {
      throwNativeKakaoExchangeError(exchange);
    }

    logOAuthNativeEvent("kakao_native_exchange_ok", {
      signupComplete: exchange.signupComplete ?? null,
      redirectTo: exchange.redirectTo ?? null,
    });
    endOAuthFlow("kakao");
    clearStoredLoginRequiredDetail();
    return { redirectTo: exchange.redirectTo?.trim() ?? null };
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
