"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  NativeGoogleAuthErrorCode,
  NativeGoogleSignInResult,
} from "@/lib/auth/native/native-google-auth-contract";
import {
  extractNativeGooglePluginRejectRaw,
  mapNativeGooglePluginError,
  NATIVE_GOOGLE_AUTH_PLUGIN_ID,
} from "@/lib/auth/native/native-google-auth-contract";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";

export type NativeGoogleAuthPluginSignInResult = {
  provider: "google";
  idToken?: string | null;
  userId?: string | null;
  email?: string | null;
};

export type NativeGoogleAuthPlugin = {
  signIn(): Promise<NativeGoogleAuthPluginSignInResult>;
  signOut(): Promise<void>;
};

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>(NATIVE_GOOGLE_AUTH_PLUGIN_ID);

function invokeNativeGoogleSignInViaBridge(): Promise<NativeGoogleAuthPluginSignInResult> {
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(NATIVE_GOOGLE_AUTH_PLUGIN_ID, "signIn", {}) as Promise<NativeGoogleAuthPluginSignInResult>;
  }
  return NativeGoogleAuth.signIn();
}

export class NativeGoogleAuthError extends Error {
  readonly code: NativeGoogleAuthErrorCode;

  constructor(code: NativeGoogleAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = code;
    this.code = code;
  }
}

function normalizePluginSignInResult(raw: NativeGoogleAuthPluginSignInResult): NativeGoogleSignInResult {
  const idToken = String(raw.idToken ?? "").trim();
  if (!idToken) {
    throw new NativeGoogleAuthError("google_native_token_missing");
  }
  return {
    provider: "google",
    idToken,
    userId: raw.userId ?? null,
    email: raw.email ?? null,
  };
}

export async function invokeNativeGoogleSignIn(): Promise<NativeGoogleSignInResult> {
  if (!isCapacitorNativePlatform()) {
    throw new NativeGoogleAuthError("google_native_unavailable", "Native Google login requires Android app shell");
  }

  try {
    console.error("[oauth] google_native_started", {
      platform: Capacitor.getPlatform(),
      shellPlatform: resolveCapacitorShellPlatform(),
    });
    const raw = await invokeNativeGoogleSignInViaBridge();
    console.error("[oauth] google_native_success", {
      hasIdToken: Boolean(raw.idToken),
      hasUserId: Boolean(raw.userId),
    });
    return normalizePluginSignInResult(raw);
  } catch (error) {
    const pluginCode = extractNativeGooglePluginRejectRaw(error);
    if (pluginCode === "user_cancelled") {
      console.error("[oauth] google_native_cancelled");
    } else if (pluginCode === "google_native_token_missing") {
      console.error("[oauth] google_native_token_missing");
    }
    const mapped = mapNativeGooglePluginError(pluginCode);
    console.error("[oauth] google_native_failed", { pluginCode, mapped });
    if (mapped === "user_cancelled") {
      throw new NativeGoogleAuthError("user_cancelled");
    }
    throw new NativeGoogleAuthError(mapped, pluginCode || mapped);
  }
}

export async function revokeNativeGoogleSessionIfAvailable(): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    await NativeGoogleAuth.signOut();
    console.error("[oauth] google_native_signout_ok");
  } catch {
    console.error("[oauth] google_native_signout_failed");
  }
}

export { NativeGoogleAuth };
