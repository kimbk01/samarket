"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import {
  isCallV4NativeAcceptingSurface,
  isCallV4NativePersistedSurfaceOwner,
  logCallV4IncomingOwnerDecided,
  resolveCallV4AppVisibility,
  shouldSuppressCallV4IncomingDiscoveredForSheet,
  syncCallV4NativeAcceptingSurfaceFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import {
  isCallV4CalleeAcceptRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
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
    if (isCallV4NativePersistedSurfaceOwner(callId)) {
      logCallV4("incoming_discovery_suppressed", { callId, reason: "persisted_native_owner" });
      return;
    }
    if (isCallV4NativeAcceptingSurface(callId)) {
      logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
      return;
    }
    const suppress = shouldSuppressCallV4IncomingDiscoveredForSheet({
      callId,
      visibilityState: typeof document !== "undefined" ? document.visibilityState : "visible",
    });
    if (suppress.suppress) {
      logCallV4("incoming_discovery_suppressed", { callId, reason: suppress.reason });
      return;
    }
    const appVisibility = resolveCallV4AppVisibility();
    if (appVisibility === "foreground" || appVisibility === "unknown") {
      logCallV4IncomingOwnerDecided({ callId, owner: "web_foreground", visibility: appVisibility });
    }
    callV4IncomingDiscovered(candidate);
  };
  void tick();
  const id = window.setInterval(() => void tick(), INCOMING_POLL_MS);
  return () => {
    cancelled = true;
    window.clearInterval(id);
  };
}
