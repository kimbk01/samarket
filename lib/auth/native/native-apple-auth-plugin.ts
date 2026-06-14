"use client";

import { registerPlugin } from "@capacitor/core";
import type { NativeAppleAuthErrorCode, NativeAppleSignInResult } from "@/lib/auth/native/native-apple-auth-contract";
import {
  extractNativeApplePluginRejectRaw,
  mapNativeApplePluginError,
  NATIVE_APPLE_AUTH_PLUGIN_ID,
} from "@/lib/auth/native/native-apple-auth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
} from "@/lib/platform/capacitor-native";

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

function invokeNativeAppleSignInViaBridge(
  opts?: { nonce?: string },
): Promise<NativeAppleAuthPluginSignInResult> {
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  const options = opts?.nonce ? { nonce: opts.nonce } : {};
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(NATIVE_APPLE_AUTH_PLUGIN_ID, "signIn", options) as Promise<NativeAppleAuthPluginSignInResult>;
  }
  return NativeAppleAuth.signIn(opts?.nonce ? { nonce: opts.nonce } : undefined);
}

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
  if (!isCapacitorNativePlatform()) {
    throw new NativeAppleAuthError("apple_native_unavailable", "Native Apple Sign In requires iOS app shell");
  }

  try {
    const raw = await invokeNativeAppleSignInViaBridge(opts);
    return normalizePluginSignInResult(raw);
  } catch (error) {
    const pluginCode = extractNativeApplePluginRejectRaw(error);
    const mapped = mapNativeApplePluginError(pluginCode);
    if (mapped === "user_cancelled") {
      logOAuthNativeEvent("apple_native_cancelled", { provider: "apple" });
      throw new NativeAppleAuthError("user_cancelled");
    }
    if (mapped === "apple_native_token_missing") {
      logOAuthNativeEvent("apple_native_token_missing", { provider: "apple" });
    }
    logOAuthNativeEvent("apple_native_failed", { provider: "apple", code: mapped, pluginCode: pluginCode || mapped });
    throw new NativeAppleAuthError(mapped, pluginCode || mapped);
  }
}

export { NativeAppleAuth };
