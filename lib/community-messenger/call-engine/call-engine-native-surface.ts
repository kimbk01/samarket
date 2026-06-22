"use client";

import type { CallEngineAppVisibility } from "@/lib/community-messenger/call-engine/call-engine-app-visibility";
import { shouldPreferNativeIncomingSurface } from "@/lib/community-messenger/call-engine/call-engine-app-visibility";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

export type NativeIncomingSurfaceType = "foreground_pill" | "fullscreen_intent" | "heads_up";

export type NativeIncomingSurfaceSignal = {
  callId: string;
  hasNativeIncomingSurface: boolean;
  nativeSurfaceType?: NativeIncomingSurfaceType;
  appVisibility: CallEngineAppVisibility;
  source: "native_fsi" | "native_foreground_pill" | "native_notification";
};

const NATIVE_SURFACE_EVENT = "dibay:call-engine-native-surface";

const nativeSurfaceByCallId = new Map<string, NativeIncomingSurfaceSignal>();

function normalizeCallId(callId: string): string {
  return callId.trim();
}

export function applyNativeIncomingSurfaceSignal(signal: NativeIncomingSurfaceSignal): void {
  const sid = normalizeCallId(signal.callId);
  if (!sid) return;
  if (!signal.hasNativeIncomingSurface) {
    nativeSurfaceByCallId.delete(sid);
  } else {
    nativeSurfaceByCallId.set(sid, { ...signal, callId: sid });
  }
  console.info("[DIBAY_CALL_ENGINE]", "native_surface_signal", {
    callId: sid,
    hasNativeIncomingSurface: signal.hasNativeIncomingSurface,
    nativeSurfaceType: signal.nativeSurfaceType ?? null,
    appVisibility: signal.appVisibility,
    source: signal.source,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NATIVE_SURFACE_EVENT, { detail: { ...signal, callId: sid } }));
  }
}

export function readNativeIncomingSurface(callId: string): NativeIncomingSurfaceSignal | null {
  const sid = normalizeCallId(callId);
  if (!sid) return null;
  return nativeSurfaceByCallId.get(sid) ?? null;
}

/** background/locked 에서만 web banner 차단 — foreground 앱안은 web banner SSOT */
export function shouldNativeSurfaceBlockWebBanner(
  callId: string,
  appVisibility: CallEngineAppVisibility,
): boolean {
  if (!shouldPreferNativeIncomingSurface(appVisibility)) return false;
  const entry = readNativeIncomingSurface(callId);
  return entry?.hasNativeIncomingSurface === true;
}

export function hasNativeIncomingSurfaceForCall(callId: string): boolean {
  const entry = readNativeIncomingSurface(callId);
  return entry?.hasNativeIncomingSurface === true;
}

export function clearNativeIncomingSurface(callId: string): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  nativeSurfaceByCallId.delete(sid);
}

export function resetNativeIncomingSurfaceForTests(): void {
  nativeSurfaceByCallId.clear();
}

export function subscribeNativeIncomingSurfaceSignal(
  listener: (signal: NativeIncomingSurfaceSignal) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<NativeIncomingSurfaceSignal>).detail;
    if (!detail?.callId) return;
    listener(detail);
  };
  window.addEventListener(NATIVE_SURFACE_EVENT, onEvent);
  return () => window.removeEventListener(NATIVE_SURFACE_EVENT, onEvent);
}

/** 앱안 foreground — native pill/FSI 를 내리고 web banner owner 로 전환 */
export async function dismissNativeForegroundIncomingUi(callId: string): Promise<void> {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  clearNativeIncomingSurface(sid);
  applyNativeIncomingSurfaceSignal({
    callId: sid,
    hasNativeIncomingSurface: false,
    appVisibility: "foreground",
    source: "native_foreground_pill",
  });
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin) return;
  try {
    await plugin.dismissForegroundIncomingUi({ sessionId: sid });
    await plugin.stopIncomingRingtone({ sessionId: sid });
  } catch {
    /* best-effort */
  }
}
