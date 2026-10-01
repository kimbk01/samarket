"use client";

import { registerPlugin } from "@capacitor/core";
import type { NativeKakaoAuthErrorCode } from "@/lib/auth/native/native-kakao-auth-contract";
import type { NativeKakaoSignInResult } from "@/lib/auth/native/native-kakao-auth-contract";
import {
  extractNativeKakaoPluginRejectRaw,
  mapNativeKakaoPluginError,
  NATIVE_KAKAO_AUTH_PLUGIN_ID,
} from "@/lib/auth/native/native-kakao-auth-contract";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
} from "@/lib/platform/capacitor-native";

export type NativeKakaoAuthPluginSignInResult = {
  provider: "kakao";
  accessToken?: string | null;
  idToken?: string | null;
  refreshToken?: string | null;
  userId?: string | null;
};

export type NativeKakaoAuthPlugin = {
  signIn(): Promise<NativeKakaoAuthPluginSignInResult>;
  signOut(): Promise<void>;
};

const NativeKakaoAuth = registerPlugin<NativeKakaoAuthPlugin>(NATIVE_KAKAO_AUTH_PLUGIN_ID);

function invokeNativeKakaoPlugin<T>(method: string): Promise<T> {
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(NATIVE_KAKAO_AUTH_PLUGIN_ID, method, {}) as Promise<T>;
  }
  if (method === "signIn") {
    return NativeKakaoAuth.signIn() as Promise<T>;
  }
  if (method === "signOut") {
    return NativeKakaoAuth.signOut() as Promise<T>;
  }
  throw new Error("Native Kakao auth bridge unavailable");
}

export class NativeKakaoAuthError extends Error {
  readonly code: NativeKakaoAuthErrorCode;

  constructor(code: NativeKakaoAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = code;
    this.code = code;
  }
}

function normalizePluginSignInResult(raw: NativeKakaoAuthPluginSignInResult): NativeKakaoSignInResult {
  const accessToken = String(raw.accessToken ?? "").trim();
  if (!accessToken) {
    throw new NativeKakaoAuthError("kakao_native_token_missing");
  }
  return {
    provider: "kakao",
    accessToken,
    idToken: raw.idToken ?? null,
    refreshToken: raw.refreshToken ?? null,
    userId: raw.userId ?? null,
  };
}

export async function invokeNativeKakaoSignIn(): Promise<NativeKakaoSignInResult> {
  if (!isCapacitorNativePlatform()) {
    throw new NativeKakaoAuthError("kakao_native_unavailable", "Native Kakao login requires Android/iOS app shell");
  }

  try {
    const raw = await invokeNativeKakaoPlugin<NativeKakaoAuthPluginSignInResult>("signIn");
    return normalizePluginSignInResult(raw);
  } catch (error) {
    const pluginCode = extractNativeKakaoPluginRejectRaw(error);
    const pluginMessage =
      error && typeof error === "object"
        ? String((error as Record<string, unknown>).message ?? "").trim()
        : "";
    const mapped = mapNativeKakaoPluginError(
      pluginMessage ? `${pluginCode} ${pluginMessage}` : pluginCode,
    );
    if (mapped === "user_cancelled") {
      throw new NativeKakaoAuthError("user_cancelled");
    }
    throw new NativeKakaoAuthError(mapped, pluginCode || mapped);
  }
}

export async function revokeNativeKakaoSessionIfAvailable(): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    await invokeNativeKakaoPlugin<void>("signOut");
  } catch {
    /* ignore — best effort */
  }
}
