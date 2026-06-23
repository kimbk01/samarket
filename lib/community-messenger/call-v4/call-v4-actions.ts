"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { notifyCommunityMessengerCallInviteHangupBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { postCommunityMessengerCallSessionTerminalBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { callV4FetchSession, callV4PatchAccept, callV4PatchEnd, callV4PatchReject } from "@/lib/community-messenger/call-v4/call-v4-api";
import { joinCallV4Agora } from "@/lib/community-messenger/call-v4/call-v4-agora";
import { cleanupCallV4 } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  claimCallV4AcceptPatchOnce,
  claimCallV4EndPatchOnce,
  claimCallV4RejectPatchOnce,
} from "@/lib/community-messenger/call-v4/call-v4-patch-guard";
import {
  exitCallV4ScreenAfterCleanup,
  rememberCallV4ReturnPath,
  readCallV4ExitRouter,
  routeToCallV4Screen,
  type CallV4Router,
} from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Identity, CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";

function buildIncomingIdentity(session: CommunityMessengerCallSession): CallV4Identity {
  return {
    callId: session.id,
    roomId: session.roomId,
    callerUserId: session.initiatorUserId,
    calleeUserId: session.recipientUserId ?? session.peerUserId ?? "",
    direction: "incoming",
    mediaType: session.callKind === "video" ? "video" : "audio",
    createdAt: session.startedAt,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl ?? null,
  };
}

async function ensureCallV4CalleeIdentity(callId: string): Promise<CallV4Identity | null> {
  const sid = callId.trim();
  if (!sid) return null;
  const current = readCallV4Identity();
  if (current?.callId === sid) return current;
  const session = await callV4FetchSession(sid);
  if (!session || session.isMineInitiator) return null;
  const identity = buildIncomingIdentity(session);
  useCallV4Store.getState().setIdentity(identity);
  logCallV4("accept_identity_hydrated", { callId: sid });
  return identity;
}

function notifyCallV4PeerTerminalBestEffort(callId: string, identity: CallV4Identity | null, terminalStatus: string): void {
  const sid = callId.trim();
  if (!sid || !identity || identity.callId !== sid) return;
  const peerUserId = identity.callerUserId.trim();
  if (peerUserId) {
    void notifyCommunityMessengerCallInviteHangupBestEffort(peerUserId, sid, {
      roomId: identity.roomId ?? null,
      initiatorUserId: identity.callerUserId,
      terminalStatus,
    });
  }
  postCommunityMessengerCallSessionTerminalBusEvent({
    sessionId: sid,
    roomId: identity.roomId ?? null,
    status: terminalStatus,
  });
}

async function finalizeCallV4Terminal(
  callId: string,
  reason: CallV4TerminalPhase | string,
  router?: CallV4Router
): Promise<void> {
  await cleanupCallV4(callId, reason);
  exitCallV4ScreenAfterCleanup(router);
}

function mapCallV4RemoteTerminalReason(status: string | null | undefined): CallV4TerminalPhase {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "ended") return "ended";
  if (normalized === "failed" || normalized === "failed_or_stale") return "failed";
  return "rejected";
}

export function callV4IncomingDiscovered(session: CommunityMessengerCallSession): void {
  const callId = session.id?.trim() ?? "";
  if (!callId || session.status !== "ringing" || session.isMineInitiator) return;
  const phase = readCallV4Phase();
  const current = readCallV4Identity();
  if (current?.callId === callId && phase !== "idle") return;
  logCallV4("incoming_discovered", { callId, roomId: session.roomId });
  useCallV4Store.getState().setIdentity(buildIncomingIdentity(session));
  useCallV4Store.getState().setPhase("incoming_ringing");
}

export async function callV4Accept(
  callId: string,
  router: { push: (href: string) => void; replace?: (href: string) => void },
  options?: { skipRoute?: boolean; source?: string }
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  logCallV4("accept_click", { callId: sid, source: options?.source ?? null });
  useCallV4Store.getState().setPhase("accepting");
  rememberCallV4ReturnPath();
  if (!options?.skipRoute) {
    routeToCallV4Screen(router, sid, options?.source ?? "sheet");
  }
  const identity = await ensureCallV4CalleeIdentity(sid);
  if (!identity) {
    logCallV4("accept_identity_missing", { callId: sid });
    useCallV4Store.getState().setPhase("failed");
    await finalizeCallV4Terminal(sid, "failed", router);
    return;
  }
  if (!claimCallV4AcceptPatchOnce(sid)) return;
  const patched = await callV4PatchAccept(sid);
  if (!patched.ok) {
    logCallV4("accept_patch_failed", { callId: sid, error: patched.error ?? null });
    useCallV4Store.getState().setPhase("failed");
    await finalizeCallV4Terminal(sid, "failed", router);
    return;
  }
  useCallV4Store.getState().setPhase("joining");
  await callV4EnsureAgoraJoined(sid);
}

export async function callV4EnsureAgoraJoined(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  if (readCallV4Phase() !== "joining") return;
  const identity = readCallV4Identity();
  if (identity?.callId !== sid || identity.mediaType !== "audio") return;
  const joined = await joinCallV4Agora(sid);
  if (!joined) return;
  if (readCallV4Phase() !== "joining" || readCallV4Identity()?.callId !== sid) return;
  useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
}

export async function callV4Reject(callId: string, router?: CallV4Router): Promise<void> {
  const sid = callId.trim();
    if (!sid) return;
  logCallV4("reject_start", { callId: sid });
  if (!claimCallV4RejectPatchOnce(sid)) return;
  useCallV4Store.getState().setPhase("ending");
  const identity = readCallV4Identity();
  const patched = await callV4PatchReject(sid);
  if (!patched.ok) {
    logCallV4("reject_patch_failed_terminal_cleanup", { callId: sid, error: patched.error ?? null });
  }
  notifyCallV4PeerTerminalBestEffort(sid, identity, "rejected");
  await finalizeCallV4Terminal(sid, "rejected", router);
}

export async function callV4HandleRejectRoute(callId: string, router?: CallV4Router): Promise<void> {
  await callV4Reject(callId, router);
}

export async function callV4HandleRemoteTerminal(
  callId: string,
  status?: string | null,
  router?: CallV4Router
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  const identity = readCallV4Identity();
  if (identity?.callId !== sid) return;
  logCallV4("remote_terminal_received", { callId: sid, status: status ?? null });
  await finalizeCallV4Terminal(sid, mapCallV4RemoteTerminalReason(status), router ?? readCallV4ExitRouter() ?? undefined);
}

export async function callV4End(callId: string, router?: CallV4Router): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  if (!claimCallV4EndPatchOnce(sid)) return;
  useCallV4Store.getState().setPhase("ending");
  const identity = readCallV4Identity();
  await callV4PatchEnd(sid);
  notifyCallV4PeerTerminalBestEffort(sid, identity, "ended");
  await finalizeCallV4Terminal(sid, "ended", router);
}
