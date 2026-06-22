"use client";

import {
  tryLockCallEngineSurfaceOwner,
  isCallEngineTerminalConsumed,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
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

  if (args.appVisibility === "locked") return "native_locked_screen";
  if (args.appVisibility === "background") {
    return args.hasNativeFsi ? "native_fullscreen_intent" : "native_fullscreen_intent";
  }

  // foreground: web banner only for incoming call policy
  if (args.requestOwner === "web_in_app_banner") return "web_in_app_banner";
  if (args.requestOwner === "web_call_screen") return "web_call_screen";
  return args.requestOwner;
}

export function claimCallEngineSurfaceOwner(callId: string, owner: CallEngineSurfaceOwner): boolean {
  return tryLockCallEngineSurfaceOwner(callId, owner);
}

export function isHigherPrioritySurfaceOwner(a: CallEngineSurfaceOwner, b: CallEngineSurfaceOwner): boolean {
  return SURFACE_PRIORITY.indexOf(a) <= SURFACE_PRIORITY.indexOf(b);
}
