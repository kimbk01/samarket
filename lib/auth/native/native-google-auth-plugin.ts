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
  isNativeGoogleLoginAvailable,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";

export type NativeGoogleAuthPluginSignInResult = {
  provider: "google";
  idToken?: string | null;
  userId?: string | null;
  email?: string | null;
  recovered?: boolean | null;
  next?: string | null;
};

export type NativeGoogleAuthPlugin = {
  signIn(options?: { next?: string | null }): Promise<NativeGoogleAuthPluginSignInResult>;
  recoverSignInIfPending(): Promise<NativeGoogleAuthPluginSignInResult>;
  signOut(): Promise<void>;
};

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>(NATIVE_GOOGLE_AUTH_PLUGIN_ID);

function invokeNativeGooglePlugin<T>(
  method: string,
  options?: Record<string, unknown>,
): Promise<T> {
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(NATIVE_GOOGLE_AUTH_PLUGIN_ID, method, options ?? {}) as Promise<T>;
  }
  if (method === "signIn") {
    return NativeGoogleAuth.signIn(options as { next?: string | null }) as Promise<T>;
  }
  if (method === "recoverSignInIfPending") {
    return NativeGoogleAuth.recoverSignInIfPending() as Promise<T>;
  }
  throw new Error("Native Google auth bridge unavailable");
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

function handleNativeGooglePluginError(error: unknown): never {
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

export async function invokeNativeGoogleSignIn(input?: {
  next?: string | null;
}): Promise<NativeGoogleSignInResult & { recovered?: boolean; next?: string | null }> {
  if (!isNativeGoogleLoginAvailable()) {
    throw new NativeGoogleAuthError("google_native_unavailable", "Native Google login requires Android app shell");
  }

  try {
    console.error("[oauth] google_native_started", {
      platform: Capacitor.getPlatform(),
      shellPlatform: resolveCapacitorShellPlatform(),
      next: input?.next ?? null,
    });
    const raw = await invokeNativeGooglePlugin<NativeGoogleAuthPluginSignInResult>("signIn", {
      next: input?.next ?? null,
    });
    console.error("[oauth] google_native_success", {
      hasIdToken: Boolean(raw.idToken),
      hasUserId: Boolean(raw.userId),
      recovered: Boolean(raw.recovered),
    });
    return {
      ...normalizePluginSignInResult(raw),
      recovered: raw.recovered ?? false,
      next: raw.next ?? input?.next ?? null,
    };
  } catch (error) {
    handleNativeGooglePluginError(error);
  }
}

export async function invokeNativeGoogleRecoverSignInIfPending(): Promise<
  (NativeGoogleSignInResult & { recovered: boolean; next?: string | null }) | null
> {
  if (!isNativeGoogleLoginAvailable()) return null;

  try {
    const raw = await invokeNativeGooglePlugin<NativeGoogleAuthPluginSignInResult>("recoverSignInIfPending", {});
    if (!raw.recovered) {
      return null;
    }
    console.error("[oauth] google_native_recover_success", {
      hasIdToken: Boolean(raw.idToken),
    });
    return {
      ...normalizePluginSignInResult(raw),
      recovered: true,
      next: raw.next ?? null,
    };
  } catch (error) {
    const pluginCode = extractNativeGooglePluginRejectRaw(error);
    console.error("[oauth] google_native_recover_failed", { pluginCode });
    return null;
  }
}

export async function revokeNativeGoogleSessionIfAvailable(): Promise<void> {
  if (!isNativeGoogleLoginAvailable()) return;
  try {
    await NativeGoogleAuth.signOut();
    console.error("[oauth] google_native_signout_ok");
  } catch {
    console.error("[oauth] google_native_signout_failed");
  }
}

export { NativeGoogleAuth };
