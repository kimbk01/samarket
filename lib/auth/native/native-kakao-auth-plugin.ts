"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  NativeKakaoAuthErrorCode,
  NativeKakaoSignInResult,
} from "@/lib/auth/native/native-kakao-auth-contract";
import {
  mapNativeKakaoPluginError,
  NATIVE_KAKAO_AUTH_PLUGIN_ID,
} from "@/lib/auth/native/native-kakao-auth-contract";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
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

const NativeKakaoAuth = registerPlugin<NativeKakaoAuthPlugin>(NATIVE_KAKAO_AUTH_PLUGIN_ID, {
  web: () => import("@/lib/auth/native/native-kakao-auth-plugin.web").then((m) => new m.NativeKakaoAuthWeb()),
});

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
    console.error("[oauth] kakao_native_started", {
      platform: Capacitor.getPlatform(),
      shellPlatform: resolveCapacitorShellPlatform(),
    });
    const raw = await NativeKakaoAuth.signIn();
    console.error("[oauth] kakao_native_success", {
      hasAccessToken: Boolean(raw.accessToken),
      hasUserId: Boolean(raw.userId),
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
      console.error("[oauth] kakao_native_cancelled");
    } else if (pluginCode === "kakao_native_token_missing") {
      console.error("[oauth] kakao_native_token_missing");
    }
    const mapped = mapNativeKakaoPluginError(pluginCode);
    console.error("[oauth] kakao_native_failed", { pluginCode, mapped });
    if (mapped === "user_cancelled") {
      throw new NativeKakaoAuthError("user_cancelled");
    }
    throw new NativeKakaoAuthError(mapped, pluginCode || mapped);
  }
}

export async function revokeNativeKakaoSessionIfAvailable(): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    await NativeKakaoAuth.signOut();
    console.error("[oauth] kakao_native_signout_ok");
  } catch {
    console.error("[oauth] kakao_native_signout_failed");
  }
}

export { NativeKakaoAuth };
