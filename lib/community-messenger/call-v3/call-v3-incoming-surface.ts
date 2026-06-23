"use client";

import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";

/** V3 incoming presentation owner — Web banner vs native FSI/Activity (CallEngine 독립 SSOT). */
export type CallV3AppVisibility = "foreground" | "background" | "locked" | "unknown";

export type CallV3NativeSurfaceType =
  | "foreground_pill"
  | "fullscreen_intent"
  | "heads_up"
  | "locked_screen";

export type CallV3NativeIncomingSurfaceSignal = {
  callId: string;
  hasNativeIncomingSurface: boolean;
  nativeSurfaceType?: CallV3NativeSurfaceType;
  appVisibility?: CallV3AppVisibility;
  source: string;
};

export type CallV3IncomingSurfaceSuppressReason =
  | "background_native_owner"
  | "locked_native_owner"
  | "native_surface_active"
  | "native_foreground_pill";

const NATIVE_SURFACE_EVENT = "dibay:call-v3-native-surface";

const nativeSurfaceByCallId = new Map<string, CallV3NativeIncomingSurfaceSignal>();
let nativeForegroundIncomingCallId: string | null = null;

function normalizeCallId(callId: string): string {
  return callId.trim();
}

/** Web + document visibility 기준 (hidden → background, native owner 우선). */
export function resolveCallV3AppVisibility(
  visibilityState?: DocumentVisibilityState | string | null,
): CallV3AppVisibility {
  const vis = (
    visibilityState ??
    (typeof document !== "undefined" ? document.visibilityState : null)
  ) as DocumentVisibilityState | null;
  if (!vis) return "unknown";
  if (vis === "visible") return "foreground";
  if (vis === "hidden") return "background";
  return "unknown";
}

export function shouldUseCallV3WebIncomingBanner(appVisibility: CallV3AppVisibility): boolean {
  return appVisibility === "foreground" || appVisibility === "unknown";
}

export function shouldPreferCallV3NativeIncomingSurface(appVisibility: CallV3AppVisibility): boolean {
  return appVisibility === "background" || appVisibility === "locked";
}

export function applyCallV3NativeIncomingSurfaceSignal(signal: CallV3NativeIncomingSurfaceSignal): void {
  const sid = normalizeCallId(signal.callId);
  if (!sid) return;

  if (!signal.hasNativeIncomingSurface) {
    nativeSurfaceByCallId.delete(sid);
    if (nativeForegroundIncomingCallId === sid) {
      nativeForegroundIncomingCallId = null;
    }
  } else {
    nativeSurfaceByCallId.set(sid, { ...signal, callId: sid });
    if (signal.nativeSurfaceType === "foreground_pill") {
      nativeForegroundIncomingCallId = sid;
    }
  }

  logCallV3("native_surface_signal", {
    callId: sid,
    hasNativeIncomingSurface: signal.hasNativeIncomingSurface,
    nativeSurfaceType: signal.nativeSurfaceType ?? null,
    appVisibility: signal.appVisibility ?? null,
    source: signal.source,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NATIVE_SURFACE_EVENT, {
        detail: { ...signal, callId: sid },
      }),
    );
  }
}

export function readCallV3NativeIncomingSurface(
  callId: string,
): CallV3NativeIncomingSurfaceSignal | null {
  const sid = normalizeCallId(callId);
  if (!sid) return null;
  return nativeSurfaceByCallId.get(sid) ?? null;
}

export function getCallV3NativeForegroundIncomingCallId(): string | null {
  return nativeForegroundIncomingCallId;
}

export function hasCallV3NativeIncomingSurfaceForCall(callId: string): boolean {
  const entry = readCallV3NativeIncomingSurface(callId);
  return entry?.hasNativeIncomingSurface === true;
}

export function subscribeCallV3NativeIncomingSurfaceSignal(
  listener: (signal: CallV3NativeIncomingSurfaceSignal) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<CallV3NativeIncomingSurfaceSignal>).detail;
    if (!detail?.callId) return;
    listener(detail);
  };
  window.addEventListener(NATIVE_SURFACE_EVENT, onEvent);
  return () => window.removeEventListener(NATIVE_SURFACE_EVENT, onEvent);
}

function resolveSuppressReason(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
}): { suppress: boolean; reason: CallV3IncomingSurfaceSuppressReason | null } {
  const sid = normalizeCallId(args.callId);
  if (!sid) return { suppress: true, reason: "background_native_owner" };

  const appVisibility = resolveCallV3AppVisibility(args.visibilityState);

  if (appVisibility === "locked") {
    return { suppress: true, reason: "locked_native_owner" };
  }

  if (!shouldUseCallV3WebIncomingBanner(appVisibility)) {
    return { suppress: true, reason: "background_native_owner" };
  }

  if (
    nativeForegroundIncomingCallId === sid &&
    hasCallV3NativeIncomingSurfaceForCall(sid)
  ) {
    return { suppress: true, reason: "native_foreground_pill" };
  }

  if (
    shouldPreferCallV3NativeIncomingSurface(appVisibility) &&
    hasCallV3NativeIncomingSurfaceForCall(sid)
  ) {
    return { suppress: true, reason: "native_surface_active" };
  }

  return { suppress: false, reason: null };
}

/** Foreground in-app Web banner 표시 여부 (native owner active 시 false). */
export function shouldSuppressCallV3WebIncomingBanner(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
}): { suppress: boolean; reason: CallV3IncomingSurfaceSuppressReason | null } {
  return resolveSuppressReason(args);
}

/**
 * `incoming_banner_show` 로 이어지는 discovery/wake 억제.
 * accept/reject replay route · FCM wake inject 자체는 CallV3Provider/native-bridge 에서 유지.
 */
export function shouldSuppressCallV3IncomingDiscoveredForBanner(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
}): { suppress: boolean; reason: CallV3IncomingSurfaceSuppressReason | null } {
  return resolveSuppressReason(args);
}

export function resetCallV3IncomingSurfaceForTests(): void {
  nativeSurfaceByCallId.clear();
  nativeForegroundIncomingCallId = null;
}
