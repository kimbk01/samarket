"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { markCallV4NativeConnectedOps } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import {
  NATIVE_CALL_CONNECTED_EVENT,
  NATIVE_CALL_SERVICE_PLUGIN_ID,
  type NativeCallConnectedPayload,
} from "@/lib/call/native/native-call-service";
import { acquireConnectedVideoScreenAwake } from "@/lib/call/native/screen-awake-bridge";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

const TERMINAL_OR_BLOCKING_PHASES = new Set<CallV4Phase>([
  "ending",
  "ended",
  "cancelled",
  "rejected",
  "missed",
  "failed",
]);

const hydratedNativeConnected = new Set<string>();

type NativeConnectedSyncPlugin = {
  addListener(
    eventName: typeof NATIVE_CALL_CONNECTED_EVENT,
    listenerFunc: (payload: NativeCallConnectedPayload) => void,
  ): Promise<PluginListenerHandle>;
};

const NativeConnectedSyncPlugin = registerPlugin<NativeConnectedSyncPlugin>(NATIVE_CALL_SERVICE_PLUGIN_ID);

function buildIdentityFromNativeConnected(payload: NativeCallConnectedPayload): CallV4Identity {
  const direction = payload.direction === "outgoing" ? "outgoing" : "incoming";
  const peerUserId = payload.peerUserId?.trim() ?? "";
  const peerName = payload.peerName?.trim() || undefined;
  return {
    callId: payload.callId.trim(),
    roomId: payload.roomId?.trim() ?? "",
    callerUserId: direction === "outgoing" ? "" : peerUserId,
    calleeUserId: direction === "outgoing" ? peerUserId : "",
    direction,
    mediaType: payload.mediaType === "video" ? "video" : "audio",
    createdAt: new Date(payload.connectedAtMs).toISOString(),
    peerLabel: peerName,
    peerAvatarUrl: null,
  };
}

export async function onNativeCallConnected(payload: NativeCallConnectedPayload): Promise<void> {
  const sid = payload.callId?.trim() ?? "";
  if (!sid || payload.nativeOwned !== true) return;

  logCallV4("native_connected_received", {
    callId: sid,
    runtime: payload.runtime,
    direction: payload.direction,
  });

  const phase = readCallV4Phase();
  if (TERMINAL_OR_BLOCKING_PHASES.has(phase)) {
    logCallV4("native_connected_ignored", { callId: sid, reason: "terminal_or_ending_phase", phase });
    return;
  }

  if (!hydratedNativeConnected.has(sid)) {
    hydratedNativeConnected.add(sid);
    useCallV4Store.setState({
      phase: "connected",
      connectedAt: payload.connectedAtMs,
      identity: buildIdentityFromNativeConnected(payload),
      canStartNewCall: false,
    });
    logCallV4("native_connected_store_hydrate", { callId: sid, direction: payload.direction });
  }

  markCallV4NativeConnectedOps(sid, "native_connected");
  if (payload.mediaType === "video") {
    acquireConnectedVideoScreenAwake(sid, "native_connected");
  }
}

/** O3 — subscribe to Native Runtime connected events (Android sync-only). */
export function startNativeConnectedSync(): () => void {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return () => undefined;
  }
  if (typeof window === "undefined") return () => undefined;

  let disposed = false;
  let handle: PluginListenerHandle | null = null;

  void NativeConnectedSyncPlugin.addListener(NATIVE_CALL_CONNECTED_EVENT, (payload) => {
    void onNativeCallConnected(payload);
  })
    .then((subscription) => {
      if (disposed) {
        void subscription.remove();
        return;
      }
      handle = subscription;
    })
    .catch(() => {
      /* plugin optional until native shell ready */
    });

  return () => {
    disposed = true;
    if (handle) void handle.remove();
    handle = null;
  };
}

export function resetNativeConnectedSyncForTests(): void {
  hydratedNativeConnected.clear();
}

export type { NativeCallConnectedPayload };
