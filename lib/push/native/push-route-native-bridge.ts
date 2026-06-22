"use client";

import { registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import type { PendingPushRoute } from "@/lib/push/pending-push-route";
import { PENDING_PUSH_ROUTE_TTL_MS } from "@/lib/push/pending-push-route";

export type NativeIncomingCallPlugin = {
  dismissNotification(options: { sessionId: string }): Promise<void>;
  dismissForegroundIncomingUi(options: { sessionId: string }): Promise<void>;
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
  startIncomingRingtone(options: { sessionId: string }): Promise<void>;
  stopIncomingRingtone(options: { sessionId?: string }): Promise<void>;
  isCallConsumed(options: {
    sessionId: string;
  }): Promise<{ consumed: boolean; reason?: string }>;
  listConsumedCallIds(): Promise<{
    items: Array<{ sessionId: string; reason?: string; at?: number }>;
  }>;
  drainPendingTerminalEvents(): Promise<{
    items: Array<{ sessionId: string; status?: string; at?: number }>;
  }>;
  getForegroundIncomingCallId(): Promise<{ callId?: string | null }>;
};

let pluginPromise: Promise<NativeIncomingCallPlugin | null> | null = null;
let syncPlugin: NativeIncomingCallPlugin | null | undefined;

/**
 * Capacitor plugin proxies trap arbitrary properties, including `then`.
 * Promise/async assimilation would call `NativeIncomingCall.then()` and throw UNIMPLEMENTED.
 */
function resolveNativePluginWithoutThenableAssimilation(
  plugin: NativeIncomingCallPlugin,
): Promise<NativeIncomingCallPlugin> {
  return Promise.resolve({ plugin }).then((wrapped) => wrapped.plugin);
}

/** User-gesture ring stop — await 없이 Capacitor plugin 호출 (accept/reject 즉시). */
export function getSyncNativeIncomingCallPlugin(): NativeIncomingCallPlugin | null {
  if (!isCapacitorNativePlatform()) return null;
  if (syncPlugin !== undefined) return syncPlugin;
  try {
    syncPlugin = registerPlugin<NativeIncomingCallPlugin>("NativeIncomingCall");
  } catch {
    syncPlugin = null;
  }
  return syncPlugin;
}

export function getNativeIncomingCallPlugin(): Promise<NativeIncomingCallPlugin | null> {
  if (!isCapacitorNativePlatform()) return Promise.resolve(null);
  const sync = getSyncNativeIncomingCallPlugin();
  if (sync) return resolveNativePluginWithoutThenableAssimilation(sync);
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { registerPlugin: register } = await import("@capacitor/core");
        return await resolveNativePluginWithoutThenableAssimilation(
          register<NativeIncomingCallPlugin>("NativeIncomingCall"),
        );
      } catch {
        return null;
      }
    })();
  }
  return pluginPromise;
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
