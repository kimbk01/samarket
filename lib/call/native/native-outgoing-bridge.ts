"use client";

import { registerPlugin } from "@capacitor/core";
import { NATIVE_CALL_SERVICE_PLUGIN_ID } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

export type NativeOutgoingEstablishmentInput = {
  callId: string;
  roomId: string;
  mediaType: string;
  peerUserId?: string | null;
  peerName?: string | null;
};

export type NativeOutgoingEstablishmentResult = {
  ok: boolean;
  nativeOwned: boolean;
};

type NativeOutgoingBridgePlugin = {
  startNativeOutgoingEstablishment(
    options: NativeOutgoingEstablishmentInput,
  ): Promise<NativeOutgoingEstablishmentResult>;
  isNativeEstablishmentOwned(options: { callId: string }): Promise<{ owned: boolean }>;
  isNativeVoiceOutgoingLaneEnabled(): Promise<{ enabled: boolean }>;
};

const NativeOutgoingBridge = registerPlugin<NativeOutgoingBridgePlugin>(NATIVE_CALL_SERVICE_PLUGIN_ID);

function isAndroidNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function isIosNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";
}

/** True when outgoing must use Native Runtime only (Android Capacitor shell). */
export function isAndroidNativeOutgoingShell(): boolean {
  return isAndroidNativeShell();
}

/**
 * iOS native voice outgoing — reads bundled lane flags from native (dibay-call-lane.json).
 * No Web sessionStorage/env gate — QA only needs json + rebuild.
 */
export async function isIOSNativeOutgoingShell(): Promise<boolean> {
  if (!isIosNativeShell()) return false;
  const result = await invokeNativeIos<{ enabled: boolean }>("isNativeVoiceOutgoingLaneEnabled", {});
  return result?.enabled ?? false;
}

async function invokeNativeAndroid<T>(
  method: keyof NativeOutgoingBridgePlugin,
  options: Record<string, unknown>,
): Promise<T | null> {
  if (!isAndroidNativeShell()) return null;
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function") {
    return nativePromise(NATIVE_CALL_SERVICE_PLUGIN_ID, method, options) as Promise<T>;
  }
  const plugin = NativeOutgoingBridge as unknown as Record<string, (opts: unknown) => Promise<T>>;
  const fn = plugin[method as string];
  if (typeof fn === "function") {
    return fn(options);
  }
  return null;
}

async function invokeNativeIos<T>(
  method: keyof NativeOutgoingBridgePlugin,
  options: Record<string, unknown> = {},
): Promise<T | null> {
  if (!isIosNativeShell()) return null;
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function") {
    return nativePromise(NATIVE_CALL_SERVICE_PLUGIN_ID, method, options) as Promise<T>;
  }
  const plugin = NativeOutgoingBridge as unknown as Record<string, (opts: unknown) => Promise<T>>;
  const fn = plugin[method as string];
  if (typeof fn === "function") {
    return fn(options);
  }
  return null;
}

/** O2 — hand off outgoing establishment to Native Runtime (Android + iOS when gated). */
export async function startNativeOutgoingEstablishment(
  input: NativeOutgoingEstablishmentInput,
): Promise<NativeOutgoingEstablishmentResult> {
  const callId = input.callId.trim();
  if (!callId) {
    return { ok: false, nativeOwned: false };
  }
  if (isAndroidNativeShell()) {
    const result = await invokeNativeAndroid<NativeOutgoingEstablishmentResult>("startNativeOutgoingEstablishment", {
      callId,
      roomId: input.roomId.trim(),
      mediaType: input.mediaType.trim() || "voice",
      peerUserId: input.peerUserId?.trim() || "",
      peerName: input.peerName?.trim() || "",
    });
    return {
      ok: result?.ok ?? false,
      nativeOwned: result?.nativeOwned ?? false,
    };
  }
  if (await isIOSNativeOutgoingShell()) {
    const result = await invokeNativeIos<NativeOutgoingEstablishmentResult>("startNativeOutgoingEstablishment", {
      callId,
      roomId: input.roomId.trim(),
      mediaType: input.mediaType.trim() || "voice",
      peerUserId: input.peerUserId?.trim() || "",
      peerName: input.peerName?.trim() || "",
    });
    return {
      ok: result?.ok ?? false,
      nativeOwned: result?.nativeOwned ?? false,
    };
  }
  return { ok: false, nativeOwned: false };
}

export async function isNativeEstablishmentOwned(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  if (isAndroidNativeShell()) {
    const result = await invokeNativeAndroid<{ owned: boolean }>("isNativeEstablishmentOwned", { callId: sid });
    return result?.owned ?? false;
  }
  if (isIosNativeShell()) {
    const result = await invokeNativeIos<{ owned: boolean }>("isNativeEstablishmentOwned", { callId: sid });
    return result?.owned ?? false;
  }
  return false;
}
