"use client";

/**
 * INCOMING 레인 얇은 래퍼 — 실제 벨 소유는 incoming-call/ring-owner.ts
 */
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  stopIncomingCallRing,
  syncIncomingCallRing,
} from "@/lib/community-messenger/incoming-call/ring-owner";
import { sealDibayCallTerminalSurface, shouldAllowDibayCallRoute } from "@/lib/community-messenger/call-orchestrator";

export function dibayIncomingLaneStartRing(
  sessionId: string,
  callKind: CommunityMessengerCallKind,
  source = "incoming_lane",
  hardClearedAt: Map<string, number> = new Map()
): void {
  syncIncomingCallRing({ sessionId, callKind, hardClearedAt, source });
}

export function dibayIncomingLaneStopRing(reason: string, sessionId?: string | null): void {
  stopIncomingCallRing(reason, sessionId);
}

export function dibayCallSealTerminal(sessionId: string | null | undefined): void {
  sealDibayCallTerminalSurface(sessionId);
}

export function dibayRouteLaneAllow(path: string): boolean {
  return shouldAllowDibayCallRoute(path);
}
