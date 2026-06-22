"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import type { CommunityMessengerCallSessionPatchDebugContext } from "@/lib/community-messenger/call-http-actions";
import { fetchCommunityMessengerCallSessionByIdClient } from "@/lib/community-messenger/call-http-actions";
import { ensureCallMediaForUserGesture } from "@/lib/community-messenger/call-media-permission-preflight";
import {
  releaseIncomingCallAccept,
  releaseIncomingCallReject,
  tryClaimIncomingCallAccept,
  tryClaimIncomingCallReject,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { markNativeCalleeAcceptPending } from "@/lib/community-messenger/native-callee-accept-entry";
import {
  primeCommunityMessengerCallNavigationSeed,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { primeCommunityMessengerCallConnectionPrefetch } from "@/lib/community-messenger/call-connection-prefetch";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { getActiveCallSessionCallId, hardClearActiveCallSession, setActiveCallSession } from "@/lib/call/active-call-session";
import { mapSessionStatusToActiveCallPhase } from "@/lib/call/map-session-to-active-call";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import {
  logIncomingDiscoveredIgnored,
  shouldIgnoreIncomingDiscovered,
} from "@/lib/community-messenger/call-engine/call-engine-incoming-discovered-guard";
import { isTerminalIncomingCallStatus } from "@/lib/community-messenger/call-incoming-terminal";
import {
  handleCallEngineRemoteTerminal,
  type RemoteTerminalSource,
  type RemoteTerminalStatus,
} from "@/lib/community-messenger/call-engine/call-engine-remote-terminal";
import { hasNativeIncomingSurfaceForCall } from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import { releaseCallEngineTerminalLocalState } from "@/lib/community-messenger/call-engine/call-engine-terminal-cleanup";
import {
  isDibayCallConsumed,
  markCallConsumed,
  readCallConsumedReason,
  setDibayCallSessionPhase,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { postCommunityMessengerCallIncomingConsumedBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { getMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";
import {
  callEngineAcceptIncoming,
  runCallEnginePatchAction,
} from "@/lib/community-messenger/call-engine/call-engine-actions";
import { logCallUxEvent } from "@/lib/community-messenger/call-engine/call-engine-debug";
import { isCallEngineTerminalConsumed } from "@/lib/community-messenger/call-engine/call-engine-locks";
import {
  buildCallEngineActiveRoute,
  replaceCallEngineRouteOnce,
  routeCallEngineForAccept,
  type CallEngineRouter,
} from "@/lib/community-messenger/call-engine/call-engine-route-gate";
import { logAcceptPipeline } from "@/lib/community-messenger/call-engine/call-engine-accept-pipeline-log";
import { dismissNativeForegroundIncomingUi } from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import { getCallEngineSurfaceOwner } from "@/lib/community-messenger/call-engine/call-engine-locks";
import {
  getCallEngineState,
  setCallEngineState,
  subscribeCallEngineStateListener,
  syncCallEngineStateFromSession,
} from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  startCallEngineIncomingRingtone,
  stopCallEngineIncomingRingtone,
  startCallEngineOutgoingRingback,
  stopCallEngineOutgoingRingback,
} from "@/lib/community-messenger/call-engine/call-engine-ringtone-owner";
import {
  claimCallEngineSurfaceOwner,
  resolveCallEngineIncomingSurfaceOwner,
  type ResolveCallEngineSurfaceArgs,
} from "@/lib/community-messenger/call-engine/call-engine-surface-owner";
import { isCallEngineTerminalState } from "@/lib/community-messenger/call-engine/call-engine-transitions";
import type { CallEngineSurfaceOwner, CallIdentity } from "@/lib/community-messenger/call-engine/call-engine-types";

export type IncomingCallAcceptSource =
  | "incoming_banner_accept"
  | "incoming_banner_expand"
  | "incoming_overlay_accept"
  | "call_client_accept"
  | "call_client_hydrate_accept"
  | "native_notification_accept"
  | "native_activity_accept"
  | "group_call_accept";

function applyIncomingCallConsumedSideEffects(
  sessionId: string,
  reason: CallConsumedReason,
  source: string,
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (isDibayCallConsumed(sid)) {
    dibayIncomingLaneStopRing("already_consumed", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    postCommunityMessengerCallIncomingConsumedBusEvent(sid, reason);
    return;
  }
  setDibayCallSessionPhase(sid, reason === "accepted" ? "accepting" : "consumed", reason);
  dibayIncomingLaneStopRing(`consumed_${reason}`, sid);
  dismissAllIncomingCallNotificationsFireAndForget(sid);
  markCallConsumed(sid, reason);
  postCommunityMessengerCallIncomingConsumedBusEvent(sid, reason);
}

export type CallEngineSnapshot = {
  callId: string;
  phase: ReturnType<typeof getCallEngineState>;
  identity: CallIdentity | null;
  surfaceOwner: CallEngineSurfaceOwner | null;
  hasNativeIncomingSurface: boolean;
};

export type CallEngineGatewayRouter = {
  replace: (href: string) => void;
  push?: (href: string) => void;
};

export type CallEngineSignal =
  | {
      type: "incoming_discovered";
      session: CommunityMessengerCallSession;
      appVisibility: ResolveCallEngineSurfaceArgs["appVisibility"];
      hasNativeFsi?: boolean;
      hardClearedAt: Map<string, number>;
      source: string;
    }
  | {
      type: "user_accept";
      session: CommunityMessengerCallSession;
      router: CallEngineGatewayRouter;
      hrefOverride?: string;
      markNativeAcceptPending?: boolean;
      source: IncomingCallAcceptSource;
    }
  | { type: "user_reject"; sessionId: string; source: string }
  | {
      type: "user_end" | "user_cancel";
      callId: string;
      action: "end" | "cancel";
      init?: { durationSeconds?: number; clientEndedReason?: string };
      debugContext?: CommunityMessengerCallSessionPatchDebugContext;
      source: string;
    }
  | { type: "user_missed"; callId: string; debugContext?: CommunityMessengerCallSessionPatchDebugContext; source: string }
  | { type: "native_accept"; sessionId: string; router: CallEngineGatewayRouter; source?: IncomingCallAcceptSource }
  | { type: "native_reject"; sessionId: string; source: string }
  | { type: "native_terminal"; callId: string; terminal: "ended" | "rejected" | "missed" | "cancelled"; source: string }
  | {
      type: "remote_terminal";
      callId: string;
      status: RemoteTerminalStatus;
      source: RemoteTerminalSource;
    }
  | { type: "hydrate_session"; session: CommunityMessengerCallSession; source: string }
  | { type: "outgoing_create"; session: CommunityMessengerCallSession; router?: CallEngineGatewayRouter; source: string }
  | { type: "outgoing_ringback_start"; callId: string; kind: CommunityMessengerCallSession["callKind"]; source: string }
  | { type: "outgoing_ringback_stop"; callId: string; reason: string }
  | { type: "agora_connected"; callId: string; source: string }
  | { type: "agora_reconnecting"; callId: string; source: string }
  | { type: "network_recovered"; callId: string; source: string }
  | {
      type: "schedule_missed_timeout";
      sessions: CommunityMessengerCallSession[];
      surfaceOwner: "web_in_app_banner" | "web_call_screen" | "native";
      onTerminal?: (sessionId: string) => void;
      source: string;
    };

const identityByCallId = new Map<string, CallIdentity>();
const surfaceOwnerByCallId = new Map<string, CallEngineSurfaceOwner>();
const missedTimers = new Map<string, { timerId: number; deadline: number }>();

type SnapshotSubscriber = (snapshot: CallEngineSnapshot) => void;
const snapshotSubscribers = new Set<SnapshotSubscriber>();

function buildActiveCallAcceptHref(sessionId: string, hrefOverride?: string | null): string {
  const override = hrefOverride?.trim();
  if (override) return override;
  return `/community-messenger/calls/${encodeURIComponent(sessionId)}?action=accept&nativeAccept=1&mode=active`;
}

function buildIdentityFromSession(session: CommunityMessengerCallSession, source: CallIdentity["source"]): CallIdentity {
  return {
    callId: session.id,
    roomId: session.roomId,
    callerUserId: session.isMineInitiator ? session.initiatorUserId ?? "" : session.peerUserId ?? "",
    calleeUserId: session.recipientUserId ?? session.peerUserId ?? "",
    direction: session.isMineInitiator ? "outgoing" : "incoming",
    mediaType: session.callKind,
    createdAt: session.startedAt ?? new Date().toISOString(),
    status: session.status,
    source,
  };
}

export function getCallEngineSnapshot(callId: string): CallEngineSnapshot {
  const sid = callId.trim();
  return {
    callId: sid,
    phase: getCallEngineState(sid),
    identity: identityByCallId.get(sid) ?? null,
    surfaceOwner: surfaceOwnerByCallId.get(sid) ?? null,
    hasNativeIncomingSurface: hasNativeIncomingSurfaceForCall(sid),
  };
}

export function subscribeCallEngineSnapshot(listener: SnapshotSubscriber): () => void {
  snapshotSubscribers.add(listener);
  const onState = (id: string) => {
    listener(getCallEngineSnapshot(id));
  };
  const unsubState = subscribeCallEngineStateListener(onState);
  return () => {
    snapshotSubscribers.delete(listener);
    unsubState();
  };
}

function notifySnapshots(callId: string): void {
  const snap = getCallEngineSnapshot(callId);
  for (const listener of snapshotSubscribers) {
    listener(snap);
  }
}

function toRemoteTerminalStatus(status: string): RemoteTerminalStatus | null {
  const s = status.trim().toLowerCase();
  if (s === "ended" || s === "cancelled" || s === "rejected" || s === "missed" || s === "failed") {
    return s as RemoteTerminalStatus;
  }
  if (s === "timeout") return "missed";
  return null;
}

function isTerminalSignalBlocked(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return true;
  if (isCallEngineTerminalConsumed(sid)) return true;
  const phase = getCallEngineState(sid);
  return isCallEngineTerminalState(phase);
}

/** 수락 — terminal latch 만 차단. optimistic terminal phase 는 PATCH 전 허용하지 않음 */
function isAcceptSignalBlocked(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return true;
  if (isCallEngineTerminalConsumed(sid)) return true;
  const phase = getCallEngineState(sid);
  if (phase === "idle" || phase === "incoming_ringing" || phase === "accepting" || phase === "joining") {
    return false;
  }
  return isCallEngineTerminalState(phase);
}

function clearMissedTimer(callId: string): void {
  const meta = missedTimers.get(callId);
  if (!meta) return;
  clearTimeout(meta.timerId);
  missedTimers.delete(callId);
}

function clearAllMissedTimers(): void {
  for (const [id, meta] of missedTimers.entries()) {
    clearTimeout(meta.timerId);
    missedTimers.delete(id);
  }
}

export function scheduleCallEngineMissedTimeouts(args: {
  sessions: CommunityMessengerCallSession[];
  surfaceOwner: "web_in_app_banner" | "web_call_screen" | "native";
  onTerminal?: (sessionId: string) => void;
  source: string;
}): void {
  if (typeof window === "undefined") return;
  const timeoutMs = incomingRingTimeoutMsFromConfig(getMessengerCallSoundConfigCache());
  const now = Date.now();
  const wanted = new Map<string, number>();

  for (const s of args.sessions) {
    if (s.sessionMode !== "direct" || s.status !== "ringing" || s.isMineInitiator) continue;
    const startMs = s.startedAt ? new Date(s.startedAt).getTime() : NaN;
    if (!Number.isFinite(startMs)) continue;
    if (isTerminalSignalBlocked(s.id)) continue;
    wanted.set(s.id, startMs + timeoutMs);
  }

  for (const [sid, meta] of [...missedTimers.entries()]) {
    if (!wanted.has(sid)) {
      clearTimeout(meta.timerId);
      missedTimers.delete(sid);
    }
  }

  for (const [sid, deadline] of wanted.entries()) {
    const prev = missedTimers.get(sid);
    if (prev && prev.deadline === deadline) continue;
    if (prev) clearTimeout(prev.timerId);
    const delay = Math.max(0, deadline - now);
    const timerId = window.setTimeout(() => {
      missedTimers.delete(sid);
      if (isTerminalSignalBlocked(sid)) return;
      void dispatchCallEngineSignal({
        type: "user_missed",
        callId: sid,
        source: `${args.source}:missed_timeout:${args.surfaceOwner}`,
      }).then(() => {
        args.onTerminal?.(sid);
      });
    }, delay);
    missedTimers.set(sid, { timerId, deadline });
  }
}

export function resetCallEngineControllerForTests(): void {
  clearAllMissedTimers();
  identityByCallId.clear();
  surfaceOwnerByCallId.clear();
  snapshotSubscribers.clear();
}

function closeIncomingSurfaceOptimistic(callId: string, source: string): void {
  const sid = callId.trim();
  if (!sid) return;
  applyIncomingCallConsumedSideEffects(sid, "accepted", `${source}_optimistic`);
  if (claimCallEngineSurfaceOwner(sid, "web_call_screen")) {
    surfaceOwnerByCallId.set(sid, "web_call_screen");
    logAcceptPipeline("call_screen_owner_acquired", { callId: sid });
  } else {
    surfaceOwnerByCallId.set(sid, "web_call_screen");
    logAcceptPipeline("call_screen_owner_acquired", { callId: sid, reused: true });
  }
  logAcceptPipeline("optimistic_incoming_closed", { callId: sid });
  void dismissNativeForegroundIncomingUi(sid);
}

async function handleUserAccept(signal: Extract<CallEngineSignal, { type: "user_accept" }>): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: string;
}> {
  const s = signal.session;
  const sid = s.id.trim();
  logAcceptPipeline("accept_signal_received", { callId: sid, phase: getCallEngineState(sid) });

  if (!sid || isAcceptSignalBlocked(sid)) {
    return { ok: false, sessionId: sid, reason: "terminal_consumed" };
  }

  logAcceptPipeline("accept_click", {
    callId: sid,
    phase: getCallEngineState(sid),
    surfaceOwner: getCallEngineSurfaceOwner(sid) ?? surfaceOwnerByCallId.get(sid) ?? null,
  });
  logDibayCall("incoming_accept_click", { sessionId: sid, callId: sid, source: signal.source });
  logCallUxEvent("call_accept_tap", { callId: sid, sessionId: sid, source: signal.source });

  const liveCallId = getActiveCallSessionCallId();
  if (liveCallId && liveCallId !== sid) {
    if (isCallEngineTerminalConsumed(liveCallId)) {
      await hardClearActiveCallSession(liveCallId, "stale_before_accept");
    } else {
      return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
    }
  }

  stopCallEngineIncomingRingtone(sid, "accept_pressed_immediate");
  dismissAllIncomingCallNotificationsFireAndForget(sid);

  if (isCallEngineTerminalConsumed(sid)) {
    return { ok: false, sessionId: sid, reason: "already_consumed" };
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  rememberCallNavigationReturnPath();
  primeCommunityMessengerCallNavigationSeed(sid, s);
  primeCommunityMessengerCallConnectionPrefetch(sid);

  if (!tryClaimIncomingCallAccept(sid)) {
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  try {
    setCallEngineState(sid, "accepting");
    closeIncomingSurfaceOptimistic(sid, signal.source);
    logAcceptPipeline("accept_patch_start", { callId: sid });
    const patched = await callEngineAcceptIncoming({ callId: sid, source: signal.source });
    logAcceptPipeline("accept_patch_done", { callId: sid, status: patched.ok ? "ok" : patched.error ?? "failed" });
    if (!patched.ok) {
      syncCallEngineStateFromSession(sid, s.status, s.isMineInitiator);
      return { ok: false, sessionId: sid, reason: "patch_failed" };
    }

    if (signal.markNativeAcceptPending ?? true) {
      markNativeCalleeAcceptPending(sid);
    }

    applyIncomingCallConsumedSideEffects(sid, "accepted", signal.source);

    const updated = (await fetchCommunityMessengerCallSessionByIdClient(sid)) ?? s;
    const phase = mapSessionStatusToActiveCallPhase(updated, false);
    if (phase !== "idle") {
      setActiveCallSession(
        {
          callId: updated.id,
          roomId: updated.roomId,
          peerUserId: updated.peerUserId,
          role: "callee",
          mediaType: updated.callKind,
          phase,
        },
        "incoming_accept",
      );
    }

    const href = buildActiveCallAcceptHref(sid, signal.hrefOverride);
    routeCallEngineForAccept(signal.router, sid, href);

    void ensureCallMediaForUserGesture(s.callKind);
    notifySnapshots(sid);
    return { ok: true, sessionId: sid };
  } finally {
    releaseIncomingCallAccept(sid);
  }
}

export async function dispatchCallEngineSignal(signal: CallEngineSignal): Promise<{ ok: boolean; error?: string }> {
  switch (signal.type) {
    case "incoming_discovered": {
      const sid = signal.session.id.trim();
      if (!sid || isTerminalSignalBlocked(sid)) return { ok: false, error: "terminal_consumed" };

      const ignore = shouldIgnoreIncomingDiscovered({
        callId: sid,
        sessionStatus: signal.session.status,
        requestWebBanner: signal.appVisibility === "foreground",
        appVisibility: signal.appVisibility,
      });
      if (ignore.ignore && ignore.reason) {
        logIncomingDiscoveredIgnored({
          callId: sid,
          status: signal.session.status,
          phase: getCallEngineState(sid),
          consumedReason: readCallConsumedReason(sid),
          reason: ignore.reason,
        });
        return { ok: false, error: ignore.reason };
      }

      identityByCallId.set(sid, buildIdentityFromSession(signal.session, "fcm"));
      syncCallEngineStateFromSession(sid, signal.session.status, signal.session.isMineInitiator);
      const hasNativeFsi =
        signal.appVisibility !== "foreground" &&
        (signal.hasNativeFsi === true || hasNativeIncomingSurfaceForCall(sid));
      const owner = resolveCallEngineIncomingSurfaceOwner({
        callId: sid,
        appVisibility: signal.appVisibility,
        hasNativeFsi,
        requestOwner: "web_in_app_banner",
      });
      if (owner === "web_in_app_banner") {
        if (claimCallEngineSurfaceOwner(sid, owner)) {
          surfaceOwnerByCallId.set(sid, owner);
        }
        startCallEngineIncomingRingtone({
          callId: sid,
          callKind: signal.session.callKind,
          hardClearedAt: signal.hardClearedAt,
          source: signal.source,
        });
      }
      notifySnapshots(sid);
      return { ok: true };
    }
    case "user_accept": {
      const res = await handleUserAccept(signal);
      return { ok: res.ok, error: res.reason };
    }
    case "user_reject": {
      const sid = signal.sessionId.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      if (!tryClaimIncomingCallReject(sid)) return { ok: false, error: "duplicate_reject_blocked" };
      try {
        stopCallEngineIncomingRingtone(sid, "reject_controller");
        const patched = await runCallEnginePatchAction({ callId: sid, action: "reject", source: signal.source });
        applyIncomingCallConsumedSideEffects(sid, "declined", signal.source);
        clearMissedTimer(sid);
        surfaceOwnerByCallId.delete(sid);
        void releaseCallEngineTerminalLocalState(sid, "rejected");
        notifySnapshots(sid);
        return { ok: patched.ok, error: patched.error };
      } finally {
        releaseIncomingCallReject(sid);
      }
    }
    case "user_end":
    case "user_cancel": {
      const sid = signal.callId.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      stopCallEngineIncomingRingtone(sid, signal.type);
      stopCallEngineOutgoingRingback(sid, signal.type);
      const patched = await runCallEnginePatchAction({
        callId: sid,
        action: signal.action,
        init: signal.init,
        debugContext: signal.debugContext,
        source: signal.source,
      });
      clearMissedTimer(sid);
      if (patched.ok) {
        surfaceOwnerByCallId.delete(sid);
        void releaseCallEngineTerminalLocalState(sid, signal.action);
      }
      notifySnapshots(sid);
      return { ok: patched.ok, error: patched.error };
    }
    case "user_missed": {
      const sid = signal.callId.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      stopCallEngineIncomingRingtone(sid, "missed");
      const patched = await runCallEnginePatchAction({
        callId: sid,
        action: "missed",
        debugContext: signal.debugContext,
        source: signal.source,
      });
      clearMissedTimer(sid);
      if (patched.ok) {
        surfaceOwnerByCallId.delete(sid);
        void releaseCallEngineTerminalLocalState(sid, "missed");
      }
      notifySnapshots(sid);
      return { ok: patched.ok, error: patched.error };
    }
    case "native_accept": {
      const sid = signal.sessionId.trim();
      if (!sid || isAcceptSignalBlocked(sid)) return { ok: false, error: "terminal_consumed" };
      markNativeCalleeAcceptPending(sid);
      stopCallEngineIncomingRingtone(sid, `native_${signal.source ?? "native_notification_accept"}`);
      dismissAllIncomingCallNotificationsFireAndForget(sid);
      const session = await fetchCommunityMessengerCallSessionByIdClient(sid);
      if (!session) return { ok: false, error: "session_fetch_failed" };
      const res = await handleUserAccept({
        type: "user_accept",
        session,
        router: signal.router,
        source: signal.source ?? "native_notification_accept",
        markNativeAcceptPending: false,
      });
      return { ok: res.ok, error: res.reason };
    }
    case "native_reject": {
      return dispatchCallEngineSignal({ type: "user_reject", sessionId: signal.sessionId, source: signal.source });
    }
    case "native_terminal": {
      const sid = signal.callId.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      stopCallEngineIncomingRingtone(sid, signal.terminal);
      clearMissedTimer(sid);
      syncCallEngineStateFromSession(sid, signal.terminal === "cancelled" ? "cancelled" : signal.terminal, false);
      notifySnapshots(sid);
      return { ok: true };
    }
    case "remote_terminal": {
      const sid = signal.callId.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      clearMissedTimer(sid);
      surfaceOwnerByCallId.delete(sid);
      await handleCallEngineRemoteTerminal({
        callId: sid,
        status: signal.status,
        source: signal.source,
      });
      notifySnapshots(sid);
      return { ok: true };
    }
    case "hydrate_session": {
      const sid = signal.session.id.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      const remoteStatus = toRemoteTerminalStatus(signal.session.status);
      if (remoteStatus) {
        clearMissedTimer(sid);
        surfaceOwnerByCallId.delete(sid);
        await handleCallEngineRemoteTerminal({
          callId: sid,
          status: remoteStatus,
          source: "hydrate",
        });
        notifySnapshots(sid);
        return { ok: true };
      }
      if (isTerminalSignalBlocked(sid)) return { ok: false, error: "terminal_consumed" };
      identityByCallId.set(sid, buildIdentityFromSession(signal.session, "room_hydrate"));
      syncCallEngineStateFromSession(sid, signal.session.status, signal.session.isMineInitiator);
      notifySnapshots(sid);
      return { ok: true };
    }
    case "outgoing_create": {
      const sid = signal.session.id.trim();
      if (!sid) return { ok: false, error: "invalid_call_id" };
      identityByCallId.set(sid, buildIdentityFromSession(signal.session, "web_in_app"));
      setCallEngineState(sid, "outgoing_ringing");
      if (signal.router) {
        const href = buildCallEngineActiveRoute(sid);
        replaceCallEngineRouteOnce(signal.router, sid, href);
      }
      notifySnapshots(sid);
      return { ok: true };
    }
    case "outgoing_ringback_start": {
      if (isTerminalSignalBlocked(signal.callId)) return { ok: false, error: "terminal_consumed" };
      startCallEngineOutgoingRingback({ callId: signal.callId, kind: signal.kind, source: signal.source });
      return { ok: true };
    }
    case "outgoing_ringback_stop": {
      stopCallEngineOutgoingRingback(signal.callId, signal.reason);
      return { ok: true };
    }
    case "agora_connected": {
      const sid = signal.callId.trim();
      if (!sid || isTerminalSignalBlocked(sid)) return { ok: false, error: "terminal_consumed" };
      setCallEngineState(sid, "connected");
      stopCallEngineOutgoingRingback(sid, "connected");
      stopCallEngineIncomingRingtone(sid, "connected");
      notifySnapshots(sid);
      return { ok: true };
    }
    case "agora_reconnecting": {
      const sid = signal.callId.trim();
      if (!sid || isTerminalSignalBlocked(sid)) return { ok: false, error: "terminal_consumed" };
      const phase = getCallEngineState(sid);
      if (phase === "connected" || phase === "reconnecting") {
        setCallEngineState(sid, "reconnecting");
      }
      notifySnapshots(sid);
      return { ok: true };
    }
    case "network_recovered": {
      const sid = signal.callId.trim();
      if (!sid || isTerminalSignalBlocked(sid)) return { ok: false, error: "terminal_consumed" };
      if (getCallEngineState(sid) === "reconnecting") {
        setCallEngineState(sid, "connected");
      }
      notifySnapshots(sid);
      return { ok: true };
    }
    case "schedule_missed_timeout": {
      scheduleCallEngineMissedTimeouts(signal);
      return { ok: true };
    }
    default:
      return { ok: false, error: "unknown_signal" };
  }
}
