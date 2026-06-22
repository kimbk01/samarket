"use client";

import { logSurfaceDecision } from "@/lib/community-messenger/call-engine/call-engine-audit-log";
import {
  shouldPreferNativeIncomingSurface,
  shouldUseWebIncomingBanner,
} from "@/lib/community-messenger/call-engine/call-engine-app-visibility";
import { logCallUxEvent } from "@/lib/community-messenger/call-engine/call-engine-debug";
import { shouldNativeSurfaceBlockWebBanner } from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import { readCallConsumedReason } from "@/lib/community-messenger/incoming-call-state";
import {
  tryLockCallEngineSurfaceOwner,
  isCallEngineTerminalConsumed,
  getCallEngineSurfaceOwner,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import type { CallEngineSurfaceOwner } from "@/lib/community-messenger/call-engine/call-engine-types";

const SURFACE_PRIORITY: CallEngineSurfaceOwner[] = [
  "native_locked_screen",
  "native_fullscreen_intent",
  "web_call_screen",
  "web_in_app_banner",
  "dock_or_pip",
];

export type ResolveCallEngineSurfaceArgs = {
  callId: string;
  appVisibility: "foreground" | "background" | "locked";
  hasNativeFsi: boolean;
  requestOwner: "web_call_screen" | "web_in_app_banner" | "dock_or_pip" | "native_fullscreen_intent";
};

export function resolveCallEngineIncomingSurfaceOwner(args: ResolveCallEngineSurfaceArgs): CallEngineSurfaceOwner | null {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return null;

  const phase = getCallEngineState(sid);
  if (args.requestOwner === "dock_or_pip" && phase !== "connected") return null;

  if (args.appVisibility === "locked") {
    logSurfaceDecision({
      callId: sid,
      requestedSurface: args.requestOwner,
      currentOwner: getCallEngineSurfaceOwner(sid),
      phase,
      consumedReason: readCallConsumedReason(sid),
      allowed: args.requestOwner !== "web_in_app_banner",
      reason: "locked_native_owner",
      hasNativeIncomingSurface: args.hasNativeFsi,
      appVisibility: args.appVisibility,
    });
    if (args.requestOwner === "web_in_app_banner") return null;
    return "native_locked_screen";
  }

  if (args.appVisibility === "background") {
    if (args.requestOwner === "web_in_app_banner") {
      logSurfaceDecision({
        callId: sid,
        requestedSurface: args.requestOwner,
        currentOwner: getCallEngineSurfaceOwner(sid),
        phase,
        consumedReason: readCallConsumedReason(sid),
        allowed: false,
        reason: "background_blocks_web_banner",
        hasNativeIncomingSurface: args.hasNativeFsi,
        appVisibility: args.appVisibility,
      });
      return null;
    }
    return "native_fullscreen_intent";
  }

  // foreground 앱안: web banner 우선 — native surface 는 background/locked 에서만 web 차단
  if (
    args.requestOwner === "web_in_app_banner" &&
    shouldNativeSurfaceBlockWebBanner(sid, args.appVisibility)
  ) {
    logSurfaceDecision({
      callId: sid,
      requestedSurface: args.requestOwner,
      currentOwner: getCallEngineSurfaceOwner(sid),
      phase,
      consumedReason: readCallConsumedReason(sid),
      allowed: false,
      reason: "native_surface_blocks_web_banner_outside_foreground",
      hasNativeIncomingSurface: args.hasNativeFsi,
      appVisibility: args.appVisibility,
    });
    return null;
  }

  if (
    args.requestOwner === "web_in_app_banner" &&
    getCallEngineSurfaceOwner(sid) === "web_call_screen"
  ) {
    logSurfaceDecision({
      callId: sid,
      requestedSurface: args.requestOwner,
      currentOwner: getCallEngineSurfaceOwner(sid),
      phase,
      consumedReason: readCallConsumedReason(sid),
      allowed: false,
      reason: "web_call_screen_owner_blocks_incoming",
      hasNativeIncomingSurface: args.hasNativeFsi,
      appVisibility: args.appVisibility,
    });
    return null;
  }

  const resolved =
    args.requestOwner === "web_in_app_banner" && shouldUseWebIncomingBanner(args.appVisibility)
      ? "web_in_app_banner"
      : args.requestOwner === "web_call_screen"
        ? "web_call_screen"
        : args.requestOwner === "dock_or_pip"
          ? phase === "connected"
            ? "dock_or_pip"
            : null
          : shouldPreferNativeIncomingSurface(args.appVisibility)
            ? args.requestOwner
            : null;

  logSurfaceDecision({
    callId: sid,
    requestedSurface: args.requestOwner,
    currentOwner: getCallEngineSurfaceOwner(sid),
    phase,
    consumedReason: readCallConsumedReason(sid),
    allowed: resolved != null,
    reason: resolved ? "resolved" : "phase_or_visibility_blocked",
    hasNativeIncomingSurface: args.hasNativeFsi,
    appVisibility: args.appVisibility,
  });
  return resolved;
}

export function claimCallEngineSurfaceOwner(callId: string, owner: CallEngineSurfaceOwner): boolean {
  const sid = callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return false;

  const phase = getCallEngineState(sid);
  if (owner === "dock_or_pip" && phase !== "connected") return false;
  if (owner === "web_in_app_banner" || owner === "dock_or_pip") {
    const existingOwner = getCallEngineSurfaceOwner(sid);
    if (existingOwner === "web_call_screen") return false;
  }

  const ok = tryLockCallEngineSurfaceOwner(sid, owner);
  if (
    ok &&
    (owner === "web_in_app_banner" ||
      owner === "native_fullscreen_intent" ||
      owner === "native_locked_screen")
  ) {
    logCallUxEvent("call_incoming_surface_show", { callId, sessionId: callId, owner });
  }
  return ok;
}

export function isHigherPrioritySurfaceOwner(a: CallEngineSurfaceOwner, b: CallEngineSurfaceOwner): boolean {
  return SURFACE_PRIORITY.indexOf(a) <= SURFACE_PRIORITY.indexOf(b);
}
