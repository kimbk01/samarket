"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
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
export const NATIVE_CALL_TERMINAL_EVENT = "nativeCallTerminal";

export type NativeCallTerminalPayload = {
  callId: string;
  reason: string;
  source: string;
  nativeOwned: true;
};

export type NativeCallServicePlugin = {
  prepareAccept(options: { callId: string; callKind?: string }): Promise<{ ok: boolean }>;
  startCall(options: { callId: string; callKind?: string; phase?: string }): Promise<{ ok: boolean }>;
  endCall(options: { callId: string; reason?: string }): Promise<{ ok: boolean }>;
  getActiveCallId(): Promise<{ callId: string | null }>;
  /** 통화 중 다시 발신 버튼 — 진행 중인 네이티브 통화 화면을 앞으로 (앱 1.2+) */
  bringActiveCallToFront(): Promise<{ shown: boolean }>;
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
  /** CUT-5C — PREPARING surface without server session.id */
  startNativeOutgoingPreparing(options: {
    attemptId: string;
    roomId?: string;
    mediaType: string;
    peerUserId?: string;
    peerName?: string;
  }): Promise<{ ok: boolean }>;
  finishNativeOutgoingPreparing(options: { attemptId: string }): Promise<{ ok: boolean }>;
  bindNativeOutgoingEstablishment(options: {
    attemptId: string;
    callId: string;
    roomId: string;
    mediaType: string;
    peerUserId?: string;
    peerName?: string;
  }): Promise<{ ok: boolean; nativeOwned: boolean }>;
  isNativeEstablishmentOwned(options: { callId: string }): Promise<{ owned: boolean }>;
  isNativeVoiceOutgoingLaneEnabled(): Promise<{ enabled: boolean }>;
  isNativeVideoOutgoingLaneEnabled(): Promise<{ enabled: boolean }>;
  isNativeVoiceIncomingLaneEnabled(): Promise<{ enabled: boolean }>;
  checkCallMediaPermissions(): Promise<{ microphone: string; camera: string }>;
  requestCallMediaPermissions(options: {
    callId: string;
    callKind?: string;
  }): Promise<{ ok: boolean; callKind: string; microphone: string; camera: string }>;
  acquireScreenAwake(options: { callId: string; reason?: string }): Promise<{ ok: boolean }>;
  releaseScreenAwake(options: { callId: string; reason?: string }): Promise<{ ok: boolean }>;
  notifyScreenAwakePresentation(options: { callId: string; presentation?: string }): Promise<{ ok: boolean }>;
  persistCanonicalDeviceId(options: { deviceId: string }): Promise<{ ok: boolean }>;
  setMemberCallEligible(options: { eligible: boolean; reason?: string }): Promise<{ ok: boolean }>;
  addListener(
    eventName: string,
    listenerFunc: (data: unknown) => void,
  ): Promise<PluginListenerHandle>;
};

/** Single Capacitor registration — do not call registerPlugin(NativeCallService) elsewhere. */
export const nativeCallServicePlugin = registerPlugin<NativeCallServicePlugin>(NATIVE_CALL_SERVICE_PLUGIN_ID);

export type NativeCallServiceInvokeMethod = Exclude<keyof NativeCallServicePlugin, "addListener">;

export function invokeNativeCallServicePlugin<T>(
  method: NativeCallServiceInvokeMethod,
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
  const plugin = nativeCallServicePlugin as unknown as Record<string, (opts: unknown) => Promise<T>>;
  const fn = plugin[method as string];
  if (typeof fn === "function") {
    return fn(options ?? {});
  }
  return Promise.resolve(null);
}

function nativeCallServiceHeaderHasMethod(method: string): boolean {
  const cap = (typeof window !== "undefined" ? window : undefined) as
    | (Window & { Capacitor?: { PluginHeaders?: ReadonlyArray<{ name?: unknown; methods?: unknown }> } })
    | undefined;
  const headers = cap?.Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return false;
  const header = headers.find((h) => h && typeof h === "object" && h.name === NATIVE_CALL_SERVICE_PLUGIN_ID);
  const methods = Array.isArray(header?.methods) ? (header!.methods as ReadonlyArray<{ name?: unknown }>) : [];
  return methods.some((m) => m && typeof m === "object" && m.name === method);
}

/**
 * 통화 중 다시 발신 버튼(1회 통화) — 진행 중인 네이티브 통화 화면을 앞으로 가져온다.
 * 이 기능이 없는 이전 앱(헤더에 메서드 없음)·웹·실패·시간 초과는 false (호출부가 「통화 중」 안내).
 */
export async function bringNativeActiveCallToFront(): Promise<boolean> {
  if (!isCapacitorNativePlatform()) return false;
  if (!nativeCallServiceHeaderHasMethod("bringActiveCallToFront")) return false;
  try {
    const result = await Promise.race([
      invokeNativeCallServicePlugin<{ shown?: boolean }>("bringActiveCallToFront"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return result?.shown === true;
  } catch {
    return false;
  }
}

/** 앱 전체 통화 바 — 설치된 앱이 통화 화면 복귀(bringActiveCallToFront)를 지원하는지 (구 바이너리 제외). */
export function isNativeBringActiveCallToFrontSupported(): boolean {
  return isCapacitorNativePlatform() && nativeCallServiceHeaderHasMethod("bringActiveCallToFront");
}

/**
 * 네이티브 통화 확인 결과 — 정상 응답(통화 있음·없음)과 조회 실패를 구분한다.
 * `unknown`(브리지 예외·시간 초과·응답 형식 오류)은 통화 종료로 처리하지 않는다.
 */
export type NativeActiveCallProbe =
  | { kind: "active"; callId: string }
  | { kind: "none" }
  | { kind: "unknown" };

export type NativeBringToFrontResult = "shown" | "not_shown" | "unknown";

const NATIVE_CALL_PROBE_TIMEOUT_MS = 1500;
const PROBE_TIMEOUT = Symbol("native_call_probe_timeout");

function withProbeTimeout<T>(promise: Promise<T>): Promise<T | typeof PROBE_TIMEOUT> {
  return Promise.race([
    promise,
    new Promise<typeof PROBE_TIMEOUT>((resolve) =>
      setTimeout(() => resolve(PROBE_TIMEOUT), NATIVE_CALL_PROBE_TIMEOUT_MS),
    ),
  ]);
}

/**
 * getActiveCallId 를 3상태로 읽는다.
 * 통화 없음 응답: Android `{}`(JSObject 가 null 값 키를 제거) · iOS `{ callId: null }` — 둘 다 `none`.
 */
export async function probeNativeActiveCallId(): Promise<NativeActiveCallProbe> {
  if (!isCapacitorNativePlatform()) return { kind: "unknown" };
  try {
    const result = await withProbeTimeout(
      invokeNativeCallServicePlugin<{ callId?: unknown }>("getActiveCallId"),
    );
    if (result === PROBE_TIMEOUT || result === null || typeof result !== "object") {
      return { kind: "unknown" };
    }
    const raw = (result as { callId?: unknown }).callId;
    if (raw === undefined || raw === null) return { kind: "none" };
    if (typeof raw !== "string") return { kind: "unknown" };
    const callId = raw.trim();
    return callId ? { kind: "active", callId } : { kind: "none" };
  } catch {
    return { kind: "unknown" };
  }
}

/** 통화 바 탭 — bringActiveCallToFront 결과를 3상태로 (조회 실패를 「통화 없음」으로 보지 않는다). */
export async function bringNativeActiveCallToFrontChecked(): Promise<NativeBringToFrontResult> {
  if (!isNativeBringActiveCallToFrontSupported()) return "unknown";
  try {
    const result = await withProbeTimeout(
      invokeNativeCallServicePlugin<{ shown?: unknown }>("bringActiveCallToFront"),
    );
    if (result === PROBE_TIMEOUT || result === null || typeof result !== "object") return "unknown";
    const shown = (result as { shown?: unknown }).shown;
    if (shown === true) return "shown";
    if (shown === false) return "not_shown";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function invokeNative<T>(
  method: NativeCallServiceInvokeMethod,
  options?: Record<string, unknown>,
): Promise<T | null> {
  return invokeNativeCallServicePlugin<T>(method, options);
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
