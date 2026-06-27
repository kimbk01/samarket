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
};

const NativeOutgoingBridge = registerPlugin<NativeOutgoingBridgePlugin>(NATIVE_CALL_SERVICE_PLUGIN_ID);

function isAndroidNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

async function invokeNative<T>(method: keyof NativeOutgoingBridgePlugin, options: Record<string, unknown>): Promise<T | null> {
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

/** O2 — hand off outgoing establishment to Native Runtime (Android only). */
export async function startNativeOutgoingEstablishment(
  input: NativeOutgoingEstablishmentInput,
): Promise<NativeOutgoingEstablishmentResult> {
  const callId = input.callId.trim();
  if (!callId || !isAndroidNativeShell()) {
    return { ok: false, nativeOwned: false };
  }
  const result = await invokeNative<NativeOutgoingEstablishmentResult>("startNativeOutgoingEstablishment", {
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

export async function isNativeEstablishmentOwned(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid || !isAndroidNativeShell()) return false;
  const result = await invokeNative<{ owned: boolean }>("isNativeEstablishmentOwned", { callId: sid });
  return result?.owned ?? false;
}
