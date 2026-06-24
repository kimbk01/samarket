"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchIncomingSessions, callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import {
  getCallV4PersistedSurfaceOwner,
  isCallV4NativeAcceptingSurface,
  syncCallV4NativeAcceptingSurfaceFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import {
  isCallV4CalleeAcceptRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import { tryPrimeCallV4WebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-platform-owner-claim";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";

const INCOMING_POLL_MS = 2_000;

function pickIncomingRingingCallee(sessions: CommunityMessengerCallSession[]): CommunityMessengerCallSession | null {
  for (const session of sessions) {
    const callId = session.id?.trim() ?? "";
    if (!callId || session.status !== "ringing" || session.isMineInitiator) continue;
    return session;
  }
  return null;
}

function isIncomingDiscoveryDuplicateSkip(callId: string): boolean {
  if (isCallV4NativeAcceptingSurface(callId)) return true;
  if (isNativeAcceptInflight(callId)) return true;
  if (typeof window !== "undefined") {
    const path = `${window.location.pathname}${window.location.search}`;
    if (
      isCallV4CalleeAcceptRoute(path) &&
      readCallV4SessionIdFromNativeRoute(path) === callId
    ) {
      return true;
    }
  }
  const phase = readCallV4Phase();
  const current = readCallV4Identity();
  if (current?.callId !== callId) return false;
  return phase !== "idle";
}

/** Phase 6A — only discover when Android owner bridge says web_in_app. */
export function shouldDiscoverCallV4IncomingForWebSheet(callId: string): {
  discover: boolean;
  reason: "owner_pending" | "owner_not_web_in_app" | "allow_web_in_app";
} {
  const owner = getCallV4PersistedSurfaceOwner(callId);
  if (owner === "web_in_app") return { discover: true, reason: "allow_web_in_app" };
  if (owner === "none") return { discover: false, reason: "owner_pending" };
  return { discover: false, reason: "owner_not_web_in_app" };
}

export function discoverCallV4IncomingSessionIfWebOwner(
  session: CommunityMessengerCallSession,
): void {
  const callId = session.id?.trim() ?? "";
  if (!callId) return;
  const gate = shouldDiscoverCallV4IncomingForWebSheet(callId);
  if (!gate.discover) {
    logCallV4("incoming_discovery_suppressed", { callId, reason: gate.reason });
    return;
  }
  callV4IncomingDiscovered(session);
}

/** Re-evaluate after Android surface-owner bridge arrives. */
export async function tryHydrateCallV4IncomingForWebOwner(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  const session = await callV4FetchSession(sid);
  if (session?.status !== "ringing" || session.isMineInitiator) return;
  discoverCallV4IncomingSessionIfWebOwner(session);
}

export function startCallV4IncomingDiscovery(userId: string | null): () => void {
  if (!isCallV4TelegramLaneEnabled() || !userId) return () => {};
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    const sessions = await callV4FetchIncomingSessions();
    const candidate = pickIncomingRingingCallee(sessions);
    if (!candidate?.id) return;
    const callId = candidate.id.trim();
    if (isIncomingDiscoveryDuplicateSkip(callId)) return;
    if (isCallV4NativeAcceptingSurface(callId)) {
      logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
      return;
    }
    const gate = shouldDiscoverCallV4IncomingForWebSheet(callId);
    if (gate.discover) {
      discoverCallV4IncomingSessionIfWebOwner(candidate);
      return;
    }
    void tryPrimeCallV4WebIncomingOwner(callId, "poll_discovery").then(() => {
      if (cancelled) return;
      const after = shouldDiscoverCallV4IncomingForWebSheet(callId);
      if (after.discover) discoverCallV4IncomingSessionIfWebOwner(candidate);
    });
  };
  void tick();
  const id = window.setInterval(() => void tick(), INCOMING_POLL_MS);
  return () => {
    cancelled = true;
    window.clearInterval(id);
  };
}
