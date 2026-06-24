"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  isCallV4CalleeAcceptRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";

export type CallV4AppVisibility = "foreground" | "background" | "locked" | "unknown";

export type CallV4SurfaceOwnerKind =
  | "none"
  | "native_fsi"
  | "native_activity"
  | "web_in_app"
  | "notification_fallback"
  | "notification_action_only"
  | "accepted_transition"
  | "connected"
  | "terminal";

export type CallV4IncomingSurfaceOwner =
  | "web_foreground"
  | "native_fsi"
  | "notification_fallback";

export type CallV4NativeSurfaceType =
  | "foreground_pill"
  | "fullscreen_intent"
  | "heads_up"
  | "locked_screen";

/** Native V4 accept in flight — Web incoming sheet must not mount. */
export type CallV4NativeAcceptingSurfaceType =
  | "native_accepting"
  | "native_fullscreen_accept"
  | "native_locked_accept";

export type CallV4NativeIncomingSurfaceSignal = {
  callId: string;
  hasNativeIncomingSurface: boolean;
  nativeSurfaceType?: CallV4NativeSurfaceType;
  appVisibility?: CallV4AppVisibility;
  source: string;
};

export type CallV4SurfaceOwnerSignal = {
  callId: string;
  owner: CallV4SurfaceOwnerKind;
  reason: string;
  ts: number;
};

export type CallV4IncomingSurfaceSuppressReason =
  | "background_native_owner"
  | "locked_native_owner"
  | "native_surface_active"
  | "native_foreground_pill"
  | "native_accepting"
  | "persisted_native_owner"
  | "accepted_transition"
  | "owner_not_web_in_app"
  | "owner_pending";

const NATIVE_SURFACE_EVENT = "dibay:call-v4-native-surface";
const NATIVE_ACCEPTING_EVENT = "dibay:call-v4-native-accepting-surface";
const SURFACE_OWNER_EVENT = "dibay:call-surface-owner";
const OWNER_STORAGE_KEY = "dibay:call-v4:surface-owner";
export const CALL_V4_WEB_INCOMING_OWNER_DEFER_MS = 220;

const nativeSurfaceByCallId = new Map<string, CallV4NativeIncomingSurfaceSignal>();
const surfaceOwnerByCallId = new Map<string, CallV4SurfaceOwnerSignal>();
const nativeAcceptingByCallId = new Map<
  string,
  { surfaceType: CallV4NativeAcceptingSurfaceType; source: string }
>();
let nativeForegroundIncomingCallId: string | null = null;

function normalizeCallId(callId: string): string {
  return callId.trim();
}

function normalizeOwner(owner: string | null | undefined): CallV4SurfaceOwnerKind {
  const value = owner?.trim().toLowerCase() ?? "none";
  switch (value) {
    case "native_fsi":
    case "native_activity":
    case "web_in_app":
    case "notification_fallback":
    case "notification_action_only":
    case "accepted_transition":
    case "connected":
    case "terminal":
      return value;
    default:
      return "none";
  }
}

function readOwnerStore(): Record<string, CallV4SurfaceOwnerSignal> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(OWNER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CallV4SurfaceOwnerSignal>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOwnerStore(store: Record<string, CallV4SurfaceOwnerSignal>): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(store).length === 0) {
      window.sessionStorage.removeItem(OWNER_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // sessionStorage unavailable — in-memory only
  }
}

function persistSurfaceOwner(signal: CallV4SurfaceOwnerSignal): void {
  const sid = normalizeCallId(signal.callId);
  if (!sid) return;
  surfaceOwnerByCallId.set(sid, signal);
  const store = readOwnerStore();
  store[sid] = signal;
  writeOwnerStore(store);
}

export function getCallV4PersistedSurfaceOwner(callId: string): CallV4SurfaceOwnerKind {
  const sid = normalizeCallId(callId);
  if (!sid) return "none";
  const memory = surfaceOwnerByCallId.get(sid);
  if (memory?.owner) return memory.owner;
  const stored = readOwnerStore()[sid];
  if (stored?.owner) {
    surfaceOwnerByCallId.set(sid, stored);
    return stored.owner;
  }
  return "none";
}

export function isCallV4NativePersistedSurfaceOwner(callId: string): boolean {
  const owner = getCallV4PersistedSurfaceOwner(callId);
  return (
    owner === "native_fsi" ||
    owner === "native_activity" ||
    owner === "notification_fallback"
  );
}

export function isCallV4AcceptedTransitionOwner(callId: string): boolean {
  return getCallV4PersistedSurfaceOwner(callId) === "accepted_transition";
}

export function isCallV4TerminalSurfaceOwner(callId: string): boolean {
  const owner = getCallV4PersistedSurfaceOwner(callId);
  return owner === "terminal" || owner === "connected";
}

export function ingestCallV4SurfaceOwnerSignal(signal: CallV4SurfaceOwnerSignal): void {
  const sid = normalizeCallId(signal.callId);
  if (!sid) return;
  const normalized: CallV4SurfaceOwnerSignal = {
    callId: sid,
    owner: normalizeOwner(signal.owner),
    reason: signal.reason?.trim() || "native",
    ts: Number.isFinite(signal.ts) ? signal.ts : Date.now(),
  };
  persistSurfaceOwner(normalized);
  logCallV4("surface_owner_signal", {
    callId: sid,
    owner: normalized.owner,
    reason: normalized.reason,
  });
}

export function applyCallV4SurfaceOwnerSignal(signal: CallV4SurfaceOwnerSignal): void {
  ingestCallV4SurfaceOwnerSignal(signal);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SURFACE_OWNER_EVENT, { detail: { ...signal, callId: normalizeCallId(signal.callId) } }));
  }
}

export function clearCallV4SurfaceOwner(callId: string, reason = "web_cleanup"): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  surfaceOwnerByCallId.delete(sid);
  const store = readOwnerStore();
  if (store[sid]) {
    delete store[sid];
    writeOwnerStore(store);
  }
  applyCallV4SurfaceOwnerSignal({
    callId: sid,
    owner: "terminal",
    reason,
    ts: Date.now(),
  });
}

export function subscribeCallV4SurfaceOwnerSignal(listener: (signal: CallV4SurfaceOwnerSignal) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<CallV4SurfaceOwnerSignal>).detail;
    if (!detail?.callId) return;
    listener({ ...detail, callId: normalizeCallId(detail.callId), owner: normalizeOwner(detail.owner) });
  };
  window.addEventListener(SURFACE_OWNER_EVENT, onEvent);
  return () => window.removeEventListener(SURFACE_OWNER_EVENT, onEvent);
}

/** Full-screen native incoming surfaces block Web sheet even in document foreground. */
function isCallV4BlockingNativeIncomingSurface(callId: string): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  if (isCallV4NativePersistedSurfaceOwner(sid)) return true;
  if (isCallV4AcceptedTransitionOwner(sid)) return true;
  const signal = nativeSurfaceByCallId.get(sid);
  if (signal?.hasNativeIncomingSurface !== true) return false;
  const type = signal.nativeSurfaceType;
  if (type === "foreground_pill") return false;
  return true;
}

function readNativeSurfaceType(callId: string): CallV4NativeSurfaceType | undefined {
  return nativeSurfaceByCallId.get(normalizeCallId(callId))?.nativeSurfaceType;
}

function readRouteSourceFromPath(path: string): string {
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("source")?.trim() ?? "";
}

export function resolveCallV4NativeAcceptingSurfaceType(
  source: string,
): CallV4NativeAcceptingSurfaceType {
  const normalized = source.trim().toLowerCase();
  if (normalized.includes("lock")) return "native_locked_accept";
  if (
    normalized.includes("fsi") ||
    normalized.includes("fullscreen") ||
    normalized.includes("native")
  ) {
    return "native_fullscreen_accept";
  }
  return "native_accepting";
}

export function shouldRegisterCallV4NativeAcceptingFromRoute(path: string): boolean {
  if (!isCallV4CalleeAcceptRoute(path)) return false;
  const source = readRouteSourceFromPath(path);
  return source !== "sheet";
}

export function registerCallV4NativeAcceptingSurface(
  callId: string,
  surfaceType: CallV4NativeAcceptingSurfaceType,
  source: string,
): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  nativeAcceptingByCallId.set(sid, { surfaceType, source: source.trim() || "native" });
  logCallV4("native_accepting_surface_registered", {
    callId: sid,
    surfaceType,
    source: source.trim() || "native",
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NATIVE_ACCEPTING_EVENT, { detail: { callId: sid, surfaceType, source } }),
    );
  }
}

export function clearCallV4NativeAcceptingSurface(callId: string): void {
  const sid = normalizeCallId(callId);
  if (!sid || !nativeAcceptingByCallId.delete(sid)) return;
  logCallV4("native_accepting_surface_cleared", { callId: sid });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NATIVE_ACCEPTING_EVENT, { detail: { callId: sid, cleared: true } }));
  }
}

export function clearAllCallV4NativeAcceptingSurfaces(): void {
  nativeAcceptingByCallId.clear();
}

export function isCallV4NativeAcceptingSurface(callId: string): boolean {
  const sid = normalizeCallId(callId);
  return sid ? nativeAcceptingByCallId.has(sid) : false;
}

export function syncCallV4NativeAcceptingSurfaceFromWindowLocation(): string | null {
  if (typeof window === "undefined") return null;
  const path = `${window.location.pathname}${window.location.search}`;
  if (!shouldRegisterCallV4NativeAcceptingFromRoute(path)) return null;
  const callId = readCallV4SessionIdFromNativeRoute(path);
  if (!callId) return null;
  const source = readRouteSourceFromPath(path);
  registerCallV4NativeAcceptingSurface(
    callId,
    resolveCallV4NativeAcceptingSurfaceType(source),
    source || "native",
  );
  return callId;
}

export function subscribeCallV4NativeAcceptingSurfaceSignal(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = () => listener();
  window.addEventListener(NATIVE_ACCEPTING_EVENT, onEvent);
  return () => window.removeEventListener(NATIVE_ACCEPTING_EVENT, onEvent);
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
  ingestCallV4NativeIncomingSurfaceSignal(signal);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NATIVE_SURFACE_EVENT, { detail: { ...signal, callId: normalizeCallId(signal.callId) } }));
  }
}

/** Update native surface SSOT without re-dispatching (native bridge inject handler). */
export function ingestCallV4NativeIncomingSurfaceSignal(signal: CallV4NativeIncomingSurfaceSignal): void {
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
}

export function clearCallV4NativeIncomingSurface(callId: string, source = "web_cleanup"): void {
  const sid = normalizeCallId(callId);
  if (!sid || !hasCallV4NativeIncomingSurfaceForCall(sid)) return;
  applyCallV4NativeIncomingSurfaceSignal({
    callId: sid,
    hasNativeIncomingSurface: false,
    source,
  });
}

export function hasCallV4NativeIncomingSurfaceForCall(callId: string): boolean {
  const sid = normalizeCallId(callId);
  return nativeSurfaceByCallId.get(sid)?.hasNativeIncomingSurface === true;
}

export { isCallV4BlockingNativeIncomingSurface, readNativeSurfaceType };

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

  if (isCallV4AcceptedTransitionOwner(sid)) {
    return { suppress: true, reason: "accepted_transition" };
  }
  if (isCallV4TerminalSurfaceOwner(sid)) {
    return { suppress: true, reason: "accepted_transition" };
  }
  if (isCallV4NativeAcceptingSurface(sid)) {
    return { suppress: true, reason: "native_accepting" };
  }
  if (isCallV4NativePersistedSurfaceOwner(sid)) {
    return { suppress: true, reason: "persisted_native_owner" };
  }
  if (isCallV4BlockingNativeIncomingSurface(sid)) {
    return { suppress: true, reason: "native_surface_active" };
  }

  const appVisibility = resolveCallV4AppVisibility(args.visibilityState);
  if (appVisibility === "locked") return { suppress: true, reason: "locked_native_owner" };
  if (!shouldUseCallV4WebIncomingSheet(appVisibility)) {
    return { suppress: true, reason: "background_native_owner" };
  }

  const persistedOwner = getCallV4PersistedSurfaceOwner(sid);
  if (persistedOwner !== "none" && persistedOwner !== "web_in_app") {
    return { suppress: true, reason: "owner_not_web_in_app" };
  }

  const surfaceType = readNativeSurfaceType(sid);
  if (
    surfaceType === "foreground_pill" &&
    shouldPreferCallV4NativeIncomingSurface(appVisibility) &&
    hasCallV4NativeIncomingSurfaceForCall(sid)
  ) {
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

/** Defer web sheet until native owner is resolved — avoids warm-process race. */
export function shouldDeferCallV4WebIncomingSheet(args: {
  callId: string;
  discoveredAtMs: number;
  nowMs?: number;
}): { defer: boolean; reason: CallV4IncomingSurfaceSuppressReason | null } {
  const sid = normalizeCallId(args.callId);
  if (!sid) return { defer: true, reason: "owner_pending" };
  const owner = getCallV4PersistedSurfaceOwner(sid);
  if (owner === "web_in_app") return { defer: false, reason: null };
  if (isCallV4NativePersistedSurfaceOwner(sid) || isCallV4AcceptedTransitionOwner(sid)) {
    return { defer: true, reason: "persisted_native_owner" };
  }
  const elapsed = (args.nowMs ?? Date.now()) - args.discoveredAtMs;
  if (elapsed < CALL_V4_WEB_INCOMING_OWNER_DEFER_MS) {
    return { defer: true, reason: "owner_pending" };
  }
  return { defer: false, reason: null };
}

export function canRenderCallV4WebIncomingSheet(args: {
  callId: string;
  visibilityState?: DocumentVisibilityState | string | null;
  discoveredAtMs: number;
  nowMs?: number;
}): { render: boolean; reason: CallV4IncomingSurfaceSuppressReason | null } {
  const suppress = shouldSuppressCallV4WebIncomingSheet(args);
  if (suppress.suppress) return { render: false, reason: suppress.reason };
  const defer = shouldDeferCallV4WebIncomingSheet(args);
  if (defer.defer) return { render: false, reason: defer.reason };
  const owner = getCallV4PersistedSurfaceOwner(args.callId);
  if (owner !== "none" && owner !== "web_in_app") {
    return { render: false, reason: "owner_not_web_in_app" };
  }
  return { render: true, reason: null };
}

/** Foreground — Web CallV4IncomingSheet is the sole incoming UI owner (no blocking native surface). */
export function logCallV4IncomingOwnerDecided(args: {
  callId: string;
  owner: CallV4IncomingSurfaceOwner;
  visibility?: CallV4AppVisibility;
}): void {
  const sid = normalizeCallId(args.callId);
  if (!sid) return;
  if (args.owner === "web_foreground" && isCallV4BlockingNativeIncomingSurface(sid)) {
    logCallV4("incoming_owner_conflict_blocked", {
      callId: sid,
      native: true,
      web_sheet: false,
    });
    return;
  }
  const visibility = args.visibility ?? resolveCallV4AppVisibility();
  logCallV4("incoming_owner_decided", {
    callId: sid,
    owner: args.owner,
    visibility,
  });
  if (args.owner === "web_foreground") {
    applyCallV4SurfaceOwnerSignal({
      callId: sid,
      owner: "web_in_app",
      reason: "web_foreground",
      ts: Date.now(),
    });
  }
}
