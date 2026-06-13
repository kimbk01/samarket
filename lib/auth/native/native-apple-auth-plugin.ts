"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { NativeAppleAuthErrorCode, NativeAppleSignInResult } from "@/lib/auth/native/native-apple-auth-contract";
import { mapNativeApplePluginError, NATIVE_APPLE_AUTH_PLUGIN_ID } from "@/lib/auth/native/native-apple-auth-contract";

export type NativeAppleAuthPluginSignInResult = {
  provider: "apple";
  identityToken?: string | null;
  authorizationCode?: string | null;
  nonce?: string | null;
  userIdentifier?: string | null;
  email?: string | null;
  fullName?: string | null;
};

export type NativeAppleAuthPlugin = {
  signIn(options?: { nonce?: string }): Promise<NativeAppleAuthPluginSignInResult>;
};

const NativeAppleAuth = registerPlugin<NativeAppleAuthPlugin>(NATIVE_APPLE_AUTH_PLUGIN_ID, {
  web: () => import("@/lib/auth/native/native-apple-auth-plugin.web").then((m) => new m.NativeAppleAuthWeb()),
});

export class NativeAppleAuthError extends Error {
  readonly code: NativeAppleAuthErrorCode;

  constructor(code: NativeAppleAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = code;
    this.code = code;
  }
}

function normalizePluginSignInResult(raw: NativeAppleAuthPluginSignInResult): NativeAppleSignInResult {
  const identityToken = String(raw.identityToken ?? "").trim();
  if (!identityToken) {
    throw new NativeAppleAuthError("apple_native_token_missing");
  }
  return {
    provider: "apple",
    identityToken,
    authorizationCode: raw.authorizationCode ?? null,
    nonce: raw.nonce ?? null,
    userIdentifier: raw.userIdentifier ?? null,
    email: raw.email ?? null,
    fullName: raw.fullName ?? null,
  };
}

export async function invokeNativeAppleSignIn(opts?: { nonce?: string }): Promise<NativeAppleSignInResult> {
  if (!Capacitor.isNativePlatform()) {
    throw new NativeAppleAuthError("apple_native_unavailable", "Native Apple Sign In requires iOS app shell");
  }

  try {
    console.error("[oauth] apple_native_started", { platform: Capacitor.getPlatform() });
    const raw = await NativeAppleAuth.signIn(opts?.nonce ? { nonce: opts.nonce } : undefined);
    console.error("[oauth] apple_native_success", {
      hasIdentityToken: Boolean(raw.identityToken),
      hasUserIdentifier: Boolean(raw.userIdentifier),
    });
    return normalizePluginSignInResult(raw);
  } catch (error) {
    const pluginCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code ?? "")
        : error instanceof Error
          ? error.message
          : String(error);
    if (pluginCode === "user_cancelled") {
      console.error("[oauth] apple_native_cancelled");
    } else if (pluginCode === "apple_native_token_missing") {
      console.error("[oauth] apple_native_token_missing");
    }
    const mapped = mapNativeApplePluginError(pluginCode);
    if (mapped === "user_cancelled") {
      throw new NativeAppleAuthError("user_cancelled");
    }
    throw new NativeAppleAuthError(mapped, pluginCode || mapped);
  }
}

export { NativeAppleAuth };
