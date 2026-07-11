"use client";

import { registerPlugin } from "@capacitor/core";
import { canCleanupActiveCall } from "@/lib/call/active-call-session-machine";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export const NATIVE_CALL_SERVICE_PLUGIN_ID = "NativeCallService";

export type NativeCallAppState = "foreground" | "background" | "screen_off";

export type NativeActiveCallSnapshot = {
  callId: string | null;
  phase: string | null;
  mediaType: string | null;
  connected: boolean;
  fgsOwner?: string | null;
};

export type NativeCallConnectedPayload = {
  callId: string;
  roomId: string;
  mediaType: "voice" | "video";
  direction: "incoming" | "outgoing";
  peerUserId: string;
  peerName: string;
  connectedAtMs: number;
  nativeOwned: true;
  runtime: "native_voice" | "native_video";
  fgsOwner: "NativeVoiceCallService" | "NativeVideoCallService" | string;
  source: "native_connected_bridge";
};

export const NATIVE_CALL_CONNECTED_EVENT = "nativeCallConnected";

export type NativeCallServicePlugin = {
  prepareAccept(options: { callId: string; callKind?: string }): Promise<{ ok: boolean }>;
  startCall(options: { callId: string; callKind?: string; phase?: string }): Promise<{ ok: boolean }>;
  endCall(options: { callId: string; reason?: string }): Promise<{ ok: boolean }>;
  getActiveCallId(): Promise<{ callId: string | null }>;
  heartbeat(options: { callId: string }): Promise<{ ok: boolean }>;
  reportAppState(options: { callId: string; state: NativeCallAppState }): Promise<{ ok: boolean }>;
  getActiveCallSnapshot(): Promise<NativeActiveCallSnapshot>;
  reportRemoteEnded(options: { callId: string }): Promise<{ ok: boolean }>;
  startNativeOutgoingEstablishment(options: {
    callId: string;
    roomId: string;
    mediaType: string;
    peerUserId?: string;
    peerName?: string;
  }): Promise<{ ok: boolean; nativeOwned: boolean }>;
  isNativeEstablishmentOwned(options: { callId: string }): Promise<{ owned: boolean }>;
  isNativeVoiceOutgoingLaneEnabled(): Promise<{ enabled: boolean }>;
  acquireScreenAwake(options: { callId: string; reason?: string }): Promise<{ ok: boolean }>;
  releaseScreenAwake(options: { callId: string; reason?: string }): Promise<{ ok: boolean }>;
  notifyScreenAwakePresentation(options: { callId: string; presentation?: string }): Promise<{ ok: boolean }>;
};

const NativeCallService = registerPlugin<NativeCallServicePlugin>(NATIVE_CALL_SERVICE_PLUGIN_ID);

function invokeNative<T>(
  method: keyof NativeCallServicePlugin,
  options?: Record<string, unknown>,
): Promise<T | null> {
  if (!isCapacitorNativePlatform()) return Promise.resolve(null);
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function") {
    return nativePromise(NATIVE_CALL_SERVICE_PLUGIN_ID, method, options ?? {}) as Promise<T>;
  }
  const plugin = NativeCallService as unknown as Record<string, (opts: unknown) => Promise<T>>;
  const fn = plugin[method as string];
  if (typeof fn === "function") {
    return fn(options ?? {});
  }
  return Promise.resolve(null);
}

/** native accept prep — FGS 시작·알림 정리·IncomingActivity 종료 (PATCH 없음) */
export async function prepareNativeCallAccept(callId: string, callKind: "voice" | "video" = "voice"): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  logDibayCallFlow("native_accept_start", { callId: sid, callKind });
  const result = await invokeNative<{ ok: boolean }>("prepareAccept", { callId: sid, callKind });
  const ok = result?.ok ?? false;
  if (ok) {
    logDibayCallFlow("native_accept_success", { callId: sid, callKind });
    logDibayCallFlow("call_service_start", { callId: sid, callKind, phase: "accept_prep" });
  }
  return ok;
}

export async function startNativeCallService(
  callId: string,
  input: { callKind?: "voice" | "video"; phase?: "ringing" | "active" } = {},
): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  const result = await invokeNative<{ ok: boolean }>("startCall", {
    callId: sid,
    callKind: input.callKind ?? "voice",
    phase: input.phase ?? "active",
  });
  if (result?.ok) {
    logDibayCallFlow("call_service_start", { callId: sid, phase: input.phase ?? "active" });
  }
  return result?.ok ?? false;
}

export async function endNativeCallService(callId: string, reason = "client_end"): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  if (!canCleanupActiveCall(reason)) {
    logDibayCallFlow("active_call_cleanup_blocked", { callId: sid, reason });
    return false;
  }
  const result = await invokeNative<{ ok: boolean }>("endCall", { callId: sid, reason });
  if (result?.ok) {
    logDibayCallFlow("call_service_stop", { callId: sid, reason });
    logDibayCallFlow("call_end_sent_to_peer", { callId: sid, reason });
  }
  return result?.ok ?? false;
}

export async function readNativeActiveCallId(): Promise<string | null> {
  const result = await invokeNative<{ callId: string | null }>("getActiveCallId");
  const id = result?.callId?.trim();
  return id || null;
}

/** Contract alias — same as readNativeActiveCallId */
export const getActiveCall = readNativeActiveCallId;

export async function pingNativeCallHeartbeat(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  const result = await invokeNative<{ ok: boolean }>("heartbeat", { callId: sid });
  return result?.ok ?? false;
}

export async function reportNativeCallAppState(
  callId: string,
  state: NativeCallAppState,
): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  const result = await invokeNative<{ ok: boolean }>("reportAppState", { callId: sid, state });
  return result?.ok ?? false;
}

export async function readNativeActiveCallSnapshot(): Promise<NativeActiveCallSnapshot | null> {
  const result = await invokeNative<NativeActiveCallSnapshot>("getActiveCallSnapshot");
  if (!result) return null;
  return result;
}

const REMOTE_NATIVE_END_REASONS = new Set([
  "remote_ended",
  "ended",
  "rejected",
  "cancelled",
  "missed",
  "native_stale_terminal",
  "recovery_no_live_session",
]);

export async function reportNativeCallRemoteEnded(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  const result = await invokeNative<{ ok: boolean }>("reportRemoteEnded", { callId: sid });
  if (result?.ok) {
    logDibayCallFlow("call_service_stop", { callId: sid, reason: "remote_ended" });
  }
  return result?.ok ?? false;
}

export const nativeCallService = {
  prepareAccept: prepareNativeCallAccept,
  startCall: startNativeCallService,
  endCall: endNativeCallService,
  getActiveCallId: readNativeActiveCallId,
  getActiveCall: readNativeActiveCallId,
  heartbeat: pingNativeCallHeartbeat,
  reportAppState: reportNativeCallAppState,
  getActiveCallSnapshot: readNativeActiveCallSnapshot,
  reportRemoteEnded: reportNativeCallRemoteEnded,
};
