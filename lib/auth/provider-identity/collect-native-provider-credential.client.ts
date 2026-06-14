"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  invokeNativeGoogleSignIn,
} from "@/lib/auth/native/native-google-auth-plugin";
import { invokeNativeKakaoSignIn } from "@/lib/auth/native/native-kakao-auth-plugin";
import { invokeNativeAppleSignIn } from "@/lib/auth/native/native-apple-auth-plugin";
import type { LinkableAuthProvider } from "@/lib/auth/provider-identity/types";

export type NativeProviderCredentialPayload = {
  provider: LinkableAuthProvider;
  idToken?: string;
  accessToken?: string;
  identityToken?: string;
  userIdentifier?: string;
  nonce?: string;
};

export async function collectNativeProviderCredential(
  provider: LinkableAuthProvider,
  input?: { next?: string | null },
): Promise<NativeProviderCredentialPayload> {
  if (provider === "google") {
    const result = await invokeNativeGoogleSignIn({ next: input?.next ?? null });
    return { provider, idToken: result.idToken };
  }
  if (provider === "kakao") {
    const result = await invokeNativeKakaoSignIn();
    return {
      provider,
      accessToken: result.accessToken,
      idToken: result.idToken ?? undefined,
    };
  }
  const result = await invokeNativeAppleSignIn();
  return {
    provider,
    identityToken: result.identityToken,
    userIdentifier: result.userIdentifier ?? undefined,
    nonce: result.nonce ?? undefined,
  };
}

export function toOAuthProvider(provider: LinkableAuthProvider): OAuthProvider {
  return provider;
}
