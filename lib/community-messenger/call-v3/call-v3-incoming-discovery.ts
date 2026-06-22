"use client";

import type { CommunityMessengerCallSession, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import {
  callV3FetchIncomingSessions,
  callV3FetchSession,
  callV3ReconcileBeforeIncoming,
} from "@/lib/community-messenger/call-v3/call-v3-api";
import { callV3HandleRemoteTerminal, callV3IncomingDiscovered } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { isCallV3IncomingDismissed } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";
import { readCallV3Identity, readCallV3Phase } from "@/lib/community-messenger/call-v3/call-v3-store";

const INCOMING_POLL_MS = 2_000;

const TERMINAL_STATUSES = new Set<CommunityMessengerCallSessionStatus>([
  "ended",
  "rejected",
  "missed",
  "cancelled",
]);

function isTerminalSessionStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has((status ?? "").trim() as CommunityMessengerCallSessionStatus);
}

function pickIncomingRingingCalleeSession(
  sessions: CommunityMessengerCallSession[]
): CommunityMessengerCallSession | null {
  for (const session of sessions) {
    const callId = session.id?.trim() ?? "";
    if (!callId || session.status !== "ringing" || session.isMineInitiator) continue;
    if (isCallV3IncomingDismissed(callId)) continue;
    return session;
  }
  return null;
}

async function reconcileActiveIncomingRinging(): Promise<void> {
  const identity = readCallV3Identity();
  const phase = readCallV3Phase();
  if (phase !== "incoming_ringing" || !identity?.callId) return;

  const session = await callV3FetchSession(identity.callId);
  if (!session || isTerminalSessionStatus(session.status)) {
    callV3HandleRemoteTerminal(identity.callId, session?.status ?? "cancelled");
  }
}

export async function runCallV3IncomingDiscoveryTick(): Promise<void> {
  if (!isDibayCallV3SafeLaneEnabled()) return;

  logCallV3("incoming_discovery_start", {});
  await callV3ReconcileBeforeIncoming();
  await reconcileActiveIncomingRinging();

  const sessions = await callV3FetchIncomingSessions();
  const candidate = pickIncomingRingingCalleeSession(sessions);
  if (candidate) {
    callV3IncomingDiscovered(candidate);
  }
}

export function startCallV3IncomingDiscovery(): () => void {
  if (typeof window === "undefined" || !isDibayCallV3SafeLaneEnabled()) {
    return () => {};
  }

  let stopped = false;

  const tick = () => {
    if (stopped) return;
    void runCallV3IncomingDiscoveryTick();
  };

  tick();
  const interval = window.setInterval(tick, INCOMING_POLL_MS);

  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}
