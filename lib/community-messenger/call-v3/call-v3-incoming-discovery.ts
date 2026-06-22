"use client";

import type { CommunityMessengerCallSession, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import {
  callV3FetchIncomingDiscoveryFetch,
  callV3FetchSession,
  callV3ReconcileBeforeIncoming,
  type CallV3IncomingDiscoveryFetch,
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

type IncomingDiscoveryNoCandidateReason = "auth_fail" | "empty" | "filtered" | "duplicate";

type IncomingPickFilterTag = "wrong_status" | "initiator" | "dismissed" | "missing_id";

function analyzeIncomingRingingCalleePick(sessions: CommunityMessengerCallSession[]): {
  candidate: CommunityMessengerCallSession | null;
  filterTags: IncomingPickFilterTag[];
} {
  const filterTags: IncomingPickFilterTag[] = [];
  for (const session of sessions) {
    const callId = session.id?.trim() ?? "";
    if (!callId) {
      filterTags.push("missing_id");
      continue;
    }
    if (session.status !== "ringing") {
      filterTags.push("wrong_status");
      continue;
    }
    if (session.isMineInitiator) {
      filterTags.push("initiator");
      continue;
    }
    if (isCallV3IncomingDismissed(callId)) {
      filterTags.push("dismissed");
      continue;
    }
    return { candidate: session, filterTags: [] };
  }
  return { candidate: null, filterTags };
}

function isIncomingDiscoveryDuplicateSkip(callId: string): boolean {
  const phase = readCallV3Phase();
  const current = readCallV3Identity();
  if (current?.callId !== callId) return false;
  if (phase === "incoming_ringing") return true;
  return phase !== "idle";
}

function resolveIncomingDiscoveryNoCandidateReason(input: {
  fetch: CallV3IncomingDiscoveryFetch;
  filterTags: IncomingPickFilterTag[];
}): IncomingDiscoveryNoCandidateReason {
  if (!input.fetch.ok || input.fetch.httpStatus === 401 || input.fetch.httpStatus === 403) {
    return "auth_fail";
  }
  if (!input.fetch.ok || input.fetch.httpStatus >= 400) {
    return "auth_fail";
  }
  if (input.fetch.count === 0) {
    return "empty";
  }
  return "filtered";
}

function logIncomingDiscoveryNoCandidate(input: {
  rawCount: number;
  reason: IncomingDiscoveryNoCandidateReason;
  fetch: CallV3IncomingDiscoveryFetch;
  filterTags?: IncomingPickFilterTag[];
  callId?: string;
}): void {
  logCallV3("incoming_discovery_no_candidate", {
    rawCount: input.rawCount,
    reason: input.reason,
    httpStatus: input.fetch.httpStatus,
    fetchOk: input.fetch.ok,
    ...(input.filterTags?.length ? { filterTags: input.filterTags } : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.fetch.sessionIds.length ? { sessionIds: input.fetch.sessionIds } : {}),
  });
}

async function reconcileActiveIncomingRinging(): Promise<void> {
  const identity = readCallV3Identity();
  const phase = readCallV3Phase();
  const callId = identity?.callId?.trim() ?? "";
  if (!callId || identity?.direction !== "incoming") return;
  if (phase !== "incoming_ringing" && phase !== "ending") return;

  const session = await callV3FetchSession(callId);
  if (!session || isTerminalSessionStatus(session.status)) {
    callV3HandleRemoteTerminal(callId, session?.status ?? "cancelled");
  }
}

async function reconcileActiveConnectedCall(): Promise<void> {
  const identity = readCallV3Identity();
  const phase = readCallV3Phase();
  const callId = identity?.callId?.trim() ?? "";
  if (!callId) return;
  if (phase !== "connected" && phase !== "joining") return;

  const session = await callV3FetchSession(callId);
  if (!session || isTerminalSessionStatus(session.status)) {
    logCallV3("connected_session_terminal_reconcile", {
      callId,
      status: session?.status ?? "ended",
      direction: identity?.direction ?? null,
    });
    callV3HandleRemoteTerminal(callId, session?.status ?? "ended");
  }
}

export async function runCallV3IncomingDiscoveryTick(): Promise<void> {
  if (!isDibayCallV3SafeLaneEnabled()) return;

  logCallV3("incoming_discovery_start", {});
  await callV3ReconcileBeforeIncoming();
  await reconcileActiveIncomingRinging();
  await reconcileActiveConnectedCall();

  const fetch = await callV3FetchIncomingDiscoveryFetch();
  const { candidate, filterTags } = analyzeIncomingRingingCalleePick(fetch.sessions);
  if (candidate) {
    const callId = candidate.id?.trim() ?? "";
    if (callId && isIncomingDiscoveryDuplicateSkip(callId)) {
      logIncomingDiscoveryNoCandidate({
        rawCount: fetch.count,
        reason: "duplicate",
        fetch,
        callId,
      });
    }
    callV3IncomingDiscovered(candidate);
    return;
  }

  logIncomingDiscoveryNoCandidate({
    rawCount: fetch.count,
    reason: resolveIncomingDiscoveryNoCandidateReason({ fetch, filterTags }),
    fetch,
    ...(filterTags.length ? { filterTags } : {}),
  });
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
