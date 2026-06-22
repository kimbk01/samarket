"use client";

import type { CallEngineAppVisibility } from "@/lib/community-messenger/call-engine/call-engine-app-visibility";
import { getCallEngineSurfaceOwner } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { shouldNativeSurfaceBlockWebBanner } from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import { readCallConsumedReason } from "@/lib/community-messenger/incoming-call-state";

const POST_ACCEPT_PHASES = new Set(["accepting", "joining", "connected"]);

export type IncomingDiscoveredIgnoreReason =
  | "accepted_consumed_blocks_stale_ringing"
  | "stale_ringing_after_accept"
  | "web_call_screen_owner_blocks_incoming"
  | "native_incoming_surface_blocks_web_banner";

export function shouldIgnoreIncomingDiscovered(args: {
  callId: string;
  sessionStatus: string;
  requestWebBanner?: boolean;
  appVisibility?: CallEngineAppVisibility;
}): { ignore: boolean; reason: IncomingDiscoveredIgnoreReason | null } {
  const sid = args.callId.trim();
  if (!sid) return { ignore: true, reason: "accepted_consumed_blocks_stale_ringing" };

  const phase = getCallEngineState(sid);
  const consumedReason = readCallConsumedReason(sid);
  if (consumedReason === "accepted" && POST_ACCEPT_PHASES.has(phase)) {
    return { ignore: true, reason: "accepted_consumed_blocks_stale_ringing" };
  }

  if (POST_ACCEPT_PHASES.has(phase) && args.sessionStatus === "ringing") {
    return { ignore: true, reason: "stale_ringing_after_accept" };
  }

  const surfaceOwner = getCallEngineSurfaceOwner(sid);
  if (surfaceOwner === "web_call_screen" && args.sessionStatus === "ringing") {
    return { ignore: true, reason: "web_call_screen_owner_blocks_incoming" };
  }

  const appVisibility = args.appVisibility ?? "foreground";
  if (
    args.requestWebBanner &&
    shouldNativeSurfaceBlockWebBanner(sid, appVisibility)
  ) {
    return { ignore: true, reason: "native_incoming_surface_blocks_web_banner" };
  }

  return { ignore: false, reason: null };
}

export function logIncomingDiscoveredIgnored(args: {
  callId: string;
  status: string;
  phase: string | null;
  consumedReason: ReturnType<typeof readCallConsumedReason>;
  reason: IncomingDiscoveredIgnoreReason;
}): void {
  console.info("[DIBAY_CALL_ENGINE]", "incoming_discovered_ignored", args);
}
