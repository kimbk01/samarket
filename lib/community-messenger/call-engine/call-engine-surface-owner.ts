"use client";

import { logCallUxEvent } from "@/lib/community-messenger/call-engine/call-engine-debug";
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

  if (args.appVisibility === "locked") return "native_locked_screen";
  if (args.appVisibility === "background") {
    return args.hasNativeFsi ? "native_fullscreen_intent" : "native_fullscreen_intent";
  }

  // foreground: web banner only for incoming — native owner 있으면 web banner 금지
  if (args.hasNativeFsi) return null;
  if (args.requestOwner === "web_in_app_banner") return "web_in_app_banner";
  if (args.requestOwner === "web_call_screen") return "web_call_screen";
  if (args.requestOwner === "dock_or_pip") return phase === "connected" ? "dock_or_pip" : null;
  return args.requestOwner;
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
