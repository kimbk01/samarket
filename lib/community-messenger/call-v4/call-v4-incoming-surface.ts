"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

export type CallV4AppVisibility = "foreground" | "background" | "locked" | "unknown";

export type CallV4NativeSurfaceType =
  | "foreground_pill"
  | "fullscreen_intent"
  | "heads_up"
  | "locked_screen";

export type CallV4NativeIncomingSurfaceSignal = {
  callId: string;
  hasNativeIncomingSurface: boolean;
  nativeSurfaceType?: CallV4NativeSurfaceType;
  appVisibility?: CallV4AppVisibility;
  source: string;
};

export type CallV4IncomingSurfaceSuppressReason =
  | "background_native_owner"
  | "locked_native_owner"
  | "native_surface_active"
  | "native_foreground_pill";

const NATIVE_SURFACE_EVENT = "dibay:call-v4-native-surface";

const nativeSurfaceByCallId = new Map<string, CallV4NativeIncomingSurfaceSignal>();
let nativeForegroundIncomingCallId: string | null = null;

function normalizeCallId(callId: string): string {
  return callId.trim();
}

export function resolveCallV4AppVisibility(
  visibilityState?: DocumentVisibilityState | string | null,
): CallV4AppVisibility {
  const vis = (
    visibilityState ??
    (typeof document !== "undefined" ? document.visibilityState : null)
  ) as DocumentVisibilityState | null;
  if (!vis) return "unknown";
  if (vis === "visible") return "foreground";
  if (vis === "hidden") return "background";
  return "unknown";
}

export function shouldUseCallV4WebIncomingSheet(appVisibility: CallV4AppVisibility): boolean {
  return appVisibility === "foreground" || appVisibility === "unknown";
}

export function shouldPreferCallV4NativeIncomingSurface(appVisibility: CallV4AppVisibility): boolean {
  return appVisibility === "background" || appVisibility === "locked";
}

export function applyCallV4NativeIncomingSurfaceSignal(signal: CallV4NativeIncomingSurfaceSignal): void {
  const sid = normalizeCallId(signal.callId);
  if (!sid) return;
  if (!signal.hasNativeIncomingSurface) {
    nativeSurfaceByCallId.delete(sid);
    if (nativeForegroundIncomingCallId === sid) nativeForegroundIncomingCallId = null;
  } else {
    nativeSurfaceByCallId.set(sid, { ...signal, callId: sid });
    if (signal.nativeSurfaceType === "foreground_pill") {
      nativeForegroundIncomingCallId = sid;
    }
  }
  logCallV4("native_surface_signal", {
    callId: sid,
    hasNativeIncomingSurface: signal.hasNativeIncomingSurface,
    nativeSurfaceType: signal.nativeSurfaceType ?? null,
    source: signal.source,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NATIVE_SURFACE_EVENT, { detail: { ...signal, callId: sid } }));
  }
}

export function hasCallV4NativeIncomingSurfaceForCall(callId: string): boolean {
  const sid = normalizeCallId(callId);
  return nativeSurfaceByCallId.get(sid)?.hasNativeIncomingSurface === true;
}

export function subscribeCallV4NativeIncomingSurfaceSignal(
  listener: (signal: CallV4NativeIncomingSurfaceSignal) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<CallV4NativeIncomingSurfaceSignal>).detail;
    if (!detail?.callId) return;
    listener(detail);
  };
  window.addEventListener(NATIVE_SURFACE_EVENT, onEvent);
  return () => window.removeEventListener(NATIVE_SURFACE_EVENT, onEvent);
}

function resolveSuppressReason(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
}): { suppress: boolean; reason: CallV4IncomingSurfaceSuppressReason | null } {
  const sid = normalizeCallId(args.callId);
  if (!sid) return { suppress: true, reason: "background_native_owner" };
  const appVisibility = resolveCallV4AppVisibility(args.visibilityState);
  if (appVisibility === "locked") return { suppress: true, reason: "locked_native_owner" };
  if (!shouldUseCallV4WebIncomingSheet(appVisibility)) {
    return { suppress: true, reason: "background_native_owner" };
  }
  if (nativeForegroundIncomingCallId === sid && hasCallV4NativeIncomingSurfaceForCall(sid)) {
    return { suppress: true, reason: "native_foreground_pill" };
  }
  if (shouldPreferCallV4NativeIncomingSurface(appVisibility) && hasCallV4NativeIncomingSurfaceForCall(sid)) {
    return { suppress: true, reason: "native_surface_active" };
  }
  return { suppress: false, reason: null };
}

export function shouldSuppressCallV4WebIncomingSheet(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
}): { suppress: boolean; reason: CallV4IncomingSurfaceSuppressReason | null } {
  return resolveSuppressReason(args);
}

export function shouldSuppressCallV4IncomingDiscoveredForSheet(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
}): { suppress: boolean; reason: CallV4IncomingSurfaceSuppressReason | null } {
  return resolveSuppressReason(args);
}
