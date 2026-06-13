"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  isNativeSdkImplementedProvider,
  normalizeNativeExchangeProvider,
  type NativeExchangeProvider,
} from "@/lib/auth/native/native-provider-contract";
import { startNativeAppleLogin } from "@/lib/auth/native/start-native-apple-login.client";
import { startNativeKakaoLogin } from "@/lib/auth/native/start-native-kakao-login.client";
import {
  isNativeAppleLoginAvailable,
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
  return false;
}

function toNativeExchangeProvider(provider: OAuthProvider | NativeExchangeProvider): NativeExchangeProvider | null {
  return normalizeNativeExchangeProvider(provider);
}

/**
 * Native SDK login — Chrome / Custom Tab / startOAuthLogin fallback 금지.
 * Google/Facebook → native_provider_not_implemented (STEP D/F 전).
 */
export async function startNativeProviderLogin(input: StartNativeProviderLoginInput): Promise<void> {
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
    const code = provider === "kakao" ? "kakao_native_unavailable" : "apple_native_unavailable";
    throw new NativeProviderLoginError(code, provider);
  }

  if (provider === "kakao") {
    await startNativeKakaoLogin({ next: input.next ?? null });
    return;
  }

  await startNativeAppleLogin({ next: input.next ?? null });
}
