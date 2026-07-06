"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  isNativeSdkImplementedProvider,
  normalizeNativeExchangeProvider,
  type NativeExchangeProvider,
} from "@/lib/auth/native/native-provider-contract";
import type { FinishClientAuthLoginTermsHandoff } from "@/lib/auth/finish-client-auth-login.client";
import { startNativeAppleLogin } from "@/lib/auth/native/start-native-apple-login.client";
import { startNativeGoogleLogin } from "@/lib/auth/native/start-native-google-login.client";
import { startNativeKakaoLogin } from "@/lib/auth/native/start-native-kakao-login.client";
import {
  isNativeAppleLoginAvailable,
  isNativeGoogleLoginAvailable,
  isNativeKakaoLoginAvailable,
} from "@/lib/platform/capacitor-native";

export type StartNativeProviderLoginInput = {
  provider: OAuthProvider | NativeExchangeProvider;
  next?: string | null;
};

export class NativeProviderLoginError extends Error {
  readonly code: string;
  readonly provider: NativeExchangeProvider;

  constructor(code: string, provider: NativeExchangeProvider, message?: string) {
    super(message ?? code);
    this.name = code;
    this.code = code;
    this.provider = provider;
  }
}

export function isNativeProviderLoginAvailable(provider: NativeExchangeProvider): boolean {
  if (provider === "kakao") return isNativeKakaoLoginAvailable();
  if (provider === "apple") return isNativeAppleLoginAvailable();
  if (provider === "google") return isNativeGoogleLoginAvailable();
  return false;
}

function toNativeExchangeProvider(provider: OAuthProvider | NativeExchangeProvider): NativeExchangeProvider | null {
  return normalizeNativeExchangeProvider(provider);
}

function resolveUnavailableErrorCode(provider: NativeExchangeProvider): string {
  if (provider === "kakao") return "kakao_native_unavailable";
  if (provider === "apple") return "apple_native_unavailable";
  return "google_native_unavailable";
}

export type NativeProviderLoginSuccess = FinishClientAuthLoginTermsHandoff & {
  redirectTo: string | null;
};

/**
 * Native SDK login — Chrome / Custom Tab / startOAuthLogin fallback 금지.
 * Facebook → native_provider_not_implemented (STEP F 전).
 */
export async function startNativeProviderLogin(
  input: StartNativeProviderLoginInput,
): Promise<NativeProviderLoginSuccess> {
  const provider = toNativeExchangeProvider(input.provider);
  if (!provider) {
    const err = new Error("Unsupported native provider");
    err.name = "invalid_provider";
    throw err;
  }

  if (!isNativeSdkImplementedProvider(provider)) {
    throw new NativeProviderLoginError(
      "native_provider_not_implemented",
      provider,
      `${provider} native SDK login is not implemented`,
    );
  }

  if (!isNativeProviderLoginAvailable(provider)) {
    throw new NativeProviderLoginError(resolveUnavailableErrorCode(provider), provider);
  }

  if (provider === "kakao") {
    return startNativeKakaoLogin({ next: input.next ?? null });
  }

  if (provider === "google") {
    return startNativeGoogleLogin({ next: input.next ?? null });
  }

  return startNativeAppleLogin({ next: input.next ?? null });
}
