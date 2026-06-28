"use client";

import { NATIVE_CALL_SERVICE_PLUGIN_ID } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

function invokeScreenAwake(
  method: "acquireScreenAwake" | "releaseScreenAwake" | "notifyScreenAwakePresentation",
  options: Record<string, string>,
): Promise<boolean> {
  if (!isCapacitorNativePlatform()) return Promise.resolve(false);
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise !== "function") return Promise.resolve(false);
  return nativePromise(NATIVE_CALL_SERVICE_PLUGIN_ID, method, options)
    .then(() => true)
    .catch(() => false);
}

/** Connected video session — idempotent acquire. */
export function acquireConnectedVideoScreenAwake(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  void invokeScreenAwake("acquireScreenAwake", {
    callId: sid,
    reason: reason.trim() || "connected_video",
  });
}

/** Terminal cleanup only — release connected video screen-awake lease. */
export function releaseConnectedVideoScreenAwake(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  void invokeScreenAwake("releaseScreenAwake", {
    callId: sid,
    reason: reason.trim() || "cleanup",
  });
}

/** Presentation change — reapply only, never release. */
export function notifyConnectedVideoScreenAwakePresentation(callId: string, presentation: string): void {
  const sid = callId.trim();
  if (!sid) return;
  void invokeScreenAwake("notifyScreenAwakePresentation", {
    callId: sid,
    presentation: presentation.trim() || "unknown",
  });
}

export function shouldHoldConnectedVideoScreenAwake(
  mediaType: string | null | undefined,
  phase: string | null | undefined,
): boolean {
  return mediaType === "video" && phase === "connected";
}
