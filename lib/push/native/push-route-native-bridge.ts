"use client";

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import type { PendingPushRoute } from "@/lib/push/pending-push-route";
import { PENDING_PUSH_ROUTE_TTL_MS } from "@/lib/push/pending-push-route";

export type NativeIncomingCallPlugin = {
  dismissNotification(options: { sessionId: string }): Promise<void>;
  clearPendingPushRoute(): Promise<void>;
  clearPendingCallRoute(): Promise<void>;
  getPendingPushRoute(): Promise<{
    path?: string;
    notificationId?: string;
    at?: number;
  }>;
  getPendingCallRoute(): Promise<{
    path?: string;
    at?: number;
  }>;
  markCallConsumed(options: { sessionId: string; reason?: string }): Promise<void>;
  isCallConsumed(options: {
    sessionId: string;
  }): Promise<{ consumed: boolean; reason?: string }>;
  listConsumedCallIds(): Promise<{
    items: Array<{ sessionId: string; reason?: string; at?: number }>;
  }>;
  drainPendingTerminalEvents(): Promise<{
    items: Array<{ sessionId: string; status?: string; at?: number }>;
  }>;
};

let pluginPromise: Promise<{ plugin: NativeIncomingCallPlugin } | null> | null = null;

export async function getNativeIncomingCallPlugin(): Promise<NativeIncomingCallPlugin | null> {
  if (!isCapacitorNativePlatform()) return null;
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        /**
         * Capacitor plugin proxy traps arbitrary properties, including `then`.
         * Returning it directly from a Promise makes JS treat it as a thenable and calls
         * `NativeIncomingCall.then()`. Wrap it so Promise resolution never touches the proxy.
         */
        return { plugin: registerPlugin<NativeIncomingCallPlugin>("NativeIncomingCall") };
      } catch {
        return null;
      }
    })();
  }
  return (await pluginPromise)?.plugin ?? null;
}

export async function readNativePersistedPendingPushRoute(
  now = Date.now(),
): Promise<PendingPushRoute | null> {
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin) return null;
  try {
    const result = await plugin.getPendingPushRoute();
    const path = result.path?.trim() ?? "";
    if (!path.startsWith("/")) return null;
    const at = typeof result.at === "number" && Number.isFinite(result.at) ? result.at : now;
    if (now - at > PENDING_PUSH_ROUTE_TTL_MS) {
      await plugin.clearPendingPushRoute();
      return null;
    }
    return {
      path,
      notificationId: result.notificationId ?? null,
      at,
    };
  } catch {
    return null;
  }
}

export async function clearNativePersistedPendingPushRoute(): Promise<void> {
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin) return;
  try {
    await plugin.clearPendingPushRoute();
  } catch {
    /* best-effort */
  }
}

export async function readNativePersistedCallPendingRoute(
  now = Date.now(),
): Promise<PendingPushRoute | null> {
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin?.getPendingCallRoute) return null;
  try {
    const result = await plugin.getPendingCallRoute();
    const path = result.path?.trim() ?? "";
    if (!path.startsWith("/community-messenger/calls/")) return null;
    const at = typeof result.at === "number" && Number.isFinite(result.at) ? result.at : now;
    if (now - at > PENDING_PUSH_ROUTE_TTL_MS) {
      await plugin.clearPendingCallRoute?.();
      return null;
    }
    return { path, notificationId: null, at };
  } catch {
    return null;
  }
}

export async function clearNativePersistedCallPendingRoute(): Promise<void> {
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin?.clearPendingCallRoute) return;
  try {
    await plugin.clearPendingCallRoute();
  } catch {
    /* best-effort */
  }
}
