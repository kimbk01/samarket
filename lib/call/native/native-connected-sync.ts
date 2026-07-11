"use client";

import type { PluginListenerHandle } from "@capacitor/core";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { markCallV4NativeConnectedOps } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { clearCallV4MissedTimer } from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import { readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import {
  NATIVE_CALL_CONNECTED_EVENT,
  nativeCallServicePlugin,
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

function startNativeConnectedSideEffects(payload: NativeCallConnectedPayload): void {
  const sid = payload.callId.trim();
  clearCallV4MissedTimer(sid);
  logCallV4("native_connected_clear", { callId: sid });
  markCallV4NativeConnectedOps(sid, "native_connected");
  if (payload.mediaType === "video") {
    acquireConnectedVideoScreenAwake(sid, "native_connected");
  }
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

  if (hydratedNativeConnected.has(sid)) {
    startNativeConnectedSideEffects(payload);
    return;
  }

  if (payload.direction === "outgoing") {
    const session = await callV4FetchSession(sid);
    const sessionStatus = (session?.status ?? "").trim().toLowerCase();
    const trustNativeOutgoingConnected =
      payload.nativeOwned === true &&
      (payload.runtime === "native_voice" || payload.runtime === "native_video");
    if (sessionStatus !== "active" && !trustNativeOutgoingConnected) {
      useCallV4Store.setState({
        phase: "outgoing_ringing",
        connectedAt: null,
        identity: buildIdentityFromNativeConnected(payload),
        canStartNewCall: false,
      });
      logCallV4("native_connected_deferred_pre_active", {
        callId: sid,
        direction: payload.direction,
        sessionStatus: session?.status ?? null,
      });
      return;
    }
  }

  hydratedNativeConnected.add(sid);
  useCallV4Store.setState({
    phase: "connected",
    connectedAt: payload.connectedAtMs,
    identity: buildIdentityFromNativeConnected(payload),
    canStartNewCall: false,
  });
  logCallV4("native_connected_store_hydrate", { callId: sid, direction: payload.direction });
  startNativeConnectedSideEffects(payload);
}

/** O3 — subscribe to Native Runtime connected events (Android + iOS native voice parity). */
export function startNativeConnectedSync(): () => void {
  if (!isCapacitorNativePlatform()) {
    return () => undefined;
  }
  const platform = resolveCapacitorShellPlatform();
  if (platform !== "android" && platform !== "ios") {
    return () => undefined;
  }
  if (typeof window === "undefined") return () => undefined;

  let disposed = false;
  let handle: PluginListenerHandle | null = null;

  void nativeCallServicePlugin.addListener(NATIVE_CALL_CONNECTED_EVENT, (payload) => {
    void onNativeCallConnected(payload as NativeCallConnectedPayload);
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

export function clearNativeConnectedHydrationForCall(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  hydratedNativeConnected.delete(sid);
}

export function resetNativeConnectedSyncForTests(): void {
  hydratedNativeConnected.clear();
}

export type { NativeCallConnectedPayload };
