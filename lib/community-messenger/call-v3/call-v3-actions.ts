"use client";

import {
  assertPhoneVerifiedForMessengerActionOrOpenSheet,
  resolveMessengerActionReturnPath,
} from "@/lib/auth/assert-phone-verified-for-messenger-action-client";
import { isOutgoingCallPhoneVerificationRequired } from "@/lib/call/outgoing-call-start-guard";
import { isCmCallVideoEnabled } from "@/lib/community-messenger/call-phase0-basics";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { cleanupCallV3 } from "@/lib/community-messenger/call-v3/call-v3-cleanup";
import { logCallV3, logCallV3LaunchEntry } from "@/lib/community-messenger/call-v3/call-v3-debug";
import {
  startCallV3CallerActivePoll,
  stopCallV3CallerActivePoll,
} from "@/lib/community-messenger/call-v3/call-v3-caller-active";
import {
  markCallV3IncomingDismissed,
  isCallV3IncomingDismissed,
} from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import {
  claimCallV3AcceptPatchOnce,
  claimCallV3CancelPatchOnce,
  claimCallV3EndPatchOnce,
  claimCallV3RejectPatchOnce,
  releaseCallV3CancelPatchClaim,
  releaseCallV3EndPatchClaim,
} from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import {
  exitCallV3ScreenAfterCleanup,
  rememberCallV3ReturnPath,
  routeToCallV3Screen,
  type CallV3Router,
} from "@/lib/community-messenger/call-v3/call-v3-route";
import { startCallV3Ringtone, stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";
import { readCallV3Capabilities, readCallV3Identity, readCallV3Phase, useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CallV3Identity, CallV3TerminalPhase } from "@/lib/community-messenger/call-v3/call-v3-types";
import {
  callV3CreateSession,
  callV3MediaTypeFromKind,
  callV3PatchAccept,
  callV3PatchCancel,
  callV3PatchEnd,
  callV3PatchReject,
  callV3ReconcileBeforeCreate,
  callV3ResolveOutgoingRoomId,
  scheduleCallV3RejectPatchRetry,
} from "@/lib/community-messenger/call-v3/call-v3-api";
import { postCommunityMessengerCallSessionTerminalBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { notifyCommunityMessengerCallInviteHangupBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { readCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";

export type CallV3OutgoingLaunchResult =
  | { ok: true; session: CommunityMessengerCallSession; roomId: string }
  | { ok: false; userMessage: string; phoneVerificationRequired?: boolean };

let outgoingCreateInFlight: Promise<CallV3OutgoingLaunchResult> | null = null;

function buildOutgoingIdentity(session: CommunityMessengerCallSession): CallV3Identity {
  return {
    callId: session.id,
    roomId: session.roomId,
    callerUserId: session.initiatorUserId,
    calleeUserId: session.recipientUserId ?? session.peerUserId ?? "",
    direction: "outgoing",
    mediaType: session.callKind === "video" ? "video" : "audio",
    createdAt: session.startedAt,
  };
}

function outgoingMissingRoomMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_outgoing_missing_room", {
    fallbackKo: "방 정보가 없어 통화를 시작할 수 없습니다.",
    fallbackEn: "Cannot start a call because room information is missing.",
  });
}

function outgoingGenericErrorMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "common_content_unavailable", {
    fallbackKo: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    fallbackEn: "Could not start the call. Please try again.",
  });
}

export async function callV3CreateOutgoing(input: {
  roomId?: string | null;
  peerUserId?: string | null;
  mediaType: "audio" | "video";
  signal?: AbortSignal;
  router: { push: (href: string) => void; replace?: (href: string) => void };
}): Promise<CallV3OutgoingLaunchResult> {
  const { canStartNewCall } = readCallV3Capabilities();
  if (!canStartNewCall) {
    return { ok: false as const, userMessage: outgoingGenericErrorMessage() };
  }

  if (outgoingCreateInFlight) {
    return outgoingCreateInFlight;
  }

  const flight: Promise<CallV3OutgoingLaunchResult> = (async (): Promise<CallV3OutgoingLaunchResult> => {
    useCallV3Store.getState().setPhase("creating");
    useCallV3Store.setState({ canStartNewCall: false });

    await callV3ReconcileBeforeCreate();

    const roomResolved = await callV3ResolveOutgoingRoomId({
      roomId: input.roomId,
      peerUserId: input.peerUserId,
      signal: input.signal,
    });
    if (!roomResolved.ok) {
      useCallV3Store.getState().resetToIdle();
      return { ok: false as const, userMessage: outgoingMissingRoomMessage() };
    }

    const created = await callV3CreateSession({
      roomId: roomResolved.roomId,
      mediaType: input.mediaType,
    });

    if (!created.ok || !created.session?.id) {
      useCallV3Store.getState().resetToIdle();
      const err = String(created.error ?? "").trim();
      return { ok: false as const, userMessage: err || outgoingGenericErrorMessage() };
    }

    const identity = buildOutgoingIdentity(created.session);
    useCallV3Store.getState().setIdentity(identity);
    useCallV3Store.getState().setPhase("outgoing_ringing");
    routeToCallV3Screen(input.router, created.session.id);

    return { ok: true as const, session: created.session, roomId: roomResolved.roomId };
  })();

  outgoingCreateInFlight = flight;
  void flight.finally(() => {
    outgoingCreateInFlight = null;
  });

  return flight;
}

/** SSOT launch for all outgoing CTAs when V3 Safe Lane flag is ON. */
export async function callV3LaunchOutgoingDirectCall(
  input: {
    signal?: AbortSignal;
    roomId?: string | null;
    peerUserId?: string | null;
    peerLabel?: string | null;
    kind: CommunityMessengerCallKind;
  },
  router: { push: (href: string) => void; replace?: (href: string) => void }
): Promise<CallV3OutgoingLaunchResult> {
  if (!assertPhoneVerifiedForMessengerActionOrOpenSheet(resolveMessengerActionReturnPath())) {
    return { ok: false, userMessage: "", phoneVerificationRequired: true };
  }
  if (!isCmCallVideoEnabled() && input.kind === "video") {
    showMessengerSnackbar(
      safeTranslate(getRuntimeAppLanguage(), "common_content_unavailable", {
        fallbackKo: "지금은 음성 통화만 사용할 수 있습니다.",
        fallbackEn: "Only voice calls are available right now.",
      }),
      { variant: "error" }
    );
    return { ok: false, userMessage: "" };
  }

  if (typeof window !== "undefined") {
    rememberCallV3ReturnPath();
  }

  logCallV3LaunchEntry({
    roomId: input.roomId,
    peerId: input.peerUserId,
    mediaType: callV3MediaTypeFromKind(input.kind),
  });

  return callV3CreateOutgoing({
    roomId: input.roomId,
    peerUserId: input.peerUserId,
    mediaType: callV3MediaTypeFromKind(input.kind),
    signal: input.signal,
    router,
  });
}

function buildIncomingIdentity(session: CommunityMessengerCallSession, viewerUserId?: string | null): CallV3Identity {
  const calleeUserId =
    session.recipientUserId?.trim() ||
    (viewerUserId && session.initiatorUserId !== viewerUserId ? viewerUserId : "") ||
    "";
  return {
    callId: session.id,
    roomId: session.roomId,
    callerUserId: session.initiatorUserId,
    calleeUserId,
    direction: "incoming",
    mediaType: session.callKind === "video" ? "video" : "audio",
    createdAt: session.startedAt,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl ?? null,
  };
}

function mapRemoteTerminalReason(status: string | null | undefined): CallV3TerminalPhase {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "ended") return "ended";
  if (normalized === "failed" || normalized === "failed_or_stale") return "failed";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "cancelled";
}

async function finalizeCallV3Terminal(
  callId: string,
  reason: CallV3TerminalPhase | string,
  router?: CallV3Router
): Promise<void> {
  await cleanupCallV3(callId, reason);
  exitCallV3ScreenAfterCleanup(router);
}

export function callV3IncomingDiscovered(session: CommunityMessengerCallSession): void {
  const callId = session.id?.trim() ?? "";
  if (!callId || session.status !== "ringing" || session.isMineInitiator) return;
  if (isCallV3IncomingDismissed(callId)) return;

  const phase = readCallV3Phase();
  const current = readCallV3Identity();

  if (current?.callId === callId && phase !== "idle" && phase !== "incoming_ringing") {
    return;
  }

  if (current?.callId === callId && phase === "incoming_ringing") {
    return;
  }

  if (current?.callId && current.callId !== callId && phase === "incoming_ringing") {
    stopCallV3Ringtone("superseded");
    void cleanupCallV3(current.callId, "superseded");
  }

  logCallV3("incoming_discovered", { callId, roomId: session.roomId });
  const identity = buildIncomingIdentity(session);
  useCallV3Store.getState().setIdentity(identity);
  useCallV3Store.getState().setPhase("incoming_ringing");
  useCallV3Store.setState({ canReceiveNewCall: false });
  startCallV3Ringtone(callId, session.callKind);
}

export async function callV3Accept(
  callId: string,
  router: { push: (href: string) => void; replace?: (href: string) => void }
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  logCallV3("accept_click", { callId: sid });
  stopCallV3Ringtone("accept_click");

  if (!claimCallV3AcceptPatchOnce(sid)) {
    return;
  }

  useCallV3Store.getState().setPhase("accepting");
  const patched = await callV3PatchAccept(sid);
  if (!patched.ok) {
    useCallV3Store.getState().setPhase("incoming_ringing");
    return;
  }

  rememberCallV3ReturnPath();
  useCallV3Store.getState().setPhase("joining");
  routeToCallV3Screen(router, sid);
}

async function completeCallV3CalleeRejectTerminal(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  const identity = readCallV3Identity();
  const callerUserId = identity?.callerUserId?.trim() ?? "";
  if (callerUserId) {
    logCallV3("caller_terminal_notify_broadcast", { callId: sid, callerUserId, status: "rejected" });
    void notifyCommunityMessengerCallInviteHangupBestEffort(callerUserId, sid, {
      roomId: identity?.roomId ?? null,
      initiatorUserId: callerUserId,
      terminalStatus: "rejected",
    });
  }

  postCommunityMessengerCallSessionTerminalBusEvent({
    sessionId: sid,
    roomId: identity?.roomId ?? null,
    status: "rejected",
  });

  markCallV3IncomingDismissed(sid);
  await finalizeCallV3Terminal(sid, "rejected");
}

export async function callV3Reject(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  logCallV3("reject_click", { callId: sid });
  stopCallV3Ringtone("reject_click");

  if (!claimCallV3RejectPatchOnce(sid)) {
    const phase = readCallV3Phase();
    const identity = readCallV3Identity();
    if (phase === "ending" && identity?.callId === sid) {
      logCallV3("reject_click_in_flight", { callId: sid });
    }
    return;
  }

  markCallV3IncomingDismissed(sid);
  useCallV3Store.getState().setPhase("ending");
  const patched = await callV3PatchReject(sid);
  if (!patched.ok) {
    logCallV3("reject_patch_failed_terminal_cleanup", {
      callId: sid,
      error: patched.error ?? null,
    });
    scheduleCallV3RejectPatchRetry(sid);
  }

  await completeCallV3CalleeRejectTerminal(sid);
}

export async function callV3EnsureAgoraJoined(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  const phase = readCallV3Phase();
  if (phase !== "joining") return;

  const identity = readCallV3Identity();
  if (identity?.callId !== sid) return;
  if (identity.mediaType !== "audio") return;

  const joined = await import("@/lib/community-messenger/call-v3/call-v3-agora").then((mod) =>
    mod.joinCallV3Agora(sid)
  );
  if (!joined) return;
  if (readCallV3Phase() !== "joining" || readCallV3Identity()?.callId !== sid) return;

  useCallV3Store.setState({ phase: "connected", connectedAt: Date.now() });
}

export async function callV3End(
  callId: string,
  router: { replace: (href: string) => void; push?: (href: string) => void }
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  logCallV3("end_click", { callId: sid });
  stopCallV3CallerActivePoll();

  if (!claimCallV3EndPatchOnce(sid)) {
    return;
  }

  useCallV3Store.getState().setPhase("ending");

  const connectedAt = useCallV3Store.getState().connectedAt;
  const durationSeconds =
    connectedAt != null ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)) : undefined;

  const patched = await callV3PatchEnd(sid, durationSeconds != null ? { durationSeconds } : undefined);
  if (!patched.ok) {
    releaseCallV3EndPatchClaim(sid);
    useCallV3Store.getState().setPhase("connected");
    return;
  }

  logCallV3("end_patch_done", { callId: sid });
  await finalizeCallV3Terminal(sid, "ended", router);
}

export async function callV3HandleRemoteTerminal(
  callId: string,
  status?: string | null,
  router?: CallV3Router
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  const identity = readCallV3Identity();
  if (identity?.callId !== sid) return;

  logCallV3("remote_terminal_received", { callId: sid, status: status ?? null });
  stopCallV3Ringtone("remote_terminal");
  stopCallV3CallerActivePoll();
  markCallV3IncomingDismissed(sid);
  await finalizeCallV3Terminal(sid, mapRemoteTerminalReason(status), router ?? readCallV3ExitRouter() ?? undefined);
}

export async function callV3Cancel(
  callId: string,
  router: { replace: (href: string) => void; push?: (href: string) => void }
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  logCallV3("cancel_click", { callId: sid });

  if (!claimCallV3CancelPatchOnce(sid)) {
    return;
  }

  useCallV3Store.getState().setPhase("ending");

  const patched = await callV3PatchCancel(sid);
  if (!patched.ok) {
    releaseCallV3CancelPatchClaim(sid);
    useCallV3Store.getState().setPhase("outgoing_ringing");
    return;
  }

  logCallV3("cancel_patch_done", { callId: sid });
  await finalizeCallV3Terminal(sid, "cancelled", router);
}

export { startCallV3CallerActivePoll, stopCallV3CallerActivePoll };

export { isOutgoingCallPhoneVerificationRequired as isCallV3OutgoingPhoneVerificationRequired };
