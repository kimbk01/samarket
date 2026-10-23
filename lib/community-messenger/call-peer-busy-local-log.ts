"use client";

import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { appendLocalCallChatMessage } from "@/lib/community-messenger/call-chat-local-append";
import { cmCallFlow } from "@/lib/community-messenger/cm-call-debug";
import type { CallBusyKind } from "@/lib/community-messenger/call-busy-attempt-record";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/**
 * E-C1 — busy dial: caller-local chat line only (no shared call_stub).
 * Durable history is server call_log; this reconciles the dialing device timeline.
 */
export function appendLocalCallChatMessageForPeerBusy(args: {
  roomId: string;
  initiatorUserId: string;
  peerUserId?: string | null;
  callKind: CommunityMessengerCallKind;
  busyKind?: CallBusyKind;
  /** Server busy terminal session id when present — stable local key */
  sessionId?: string | null;
}): void {
  const roomId = args.roomId.trim();
  const initiatorUserId = args.initiatorUserId.trim();
  if (!roomId || !initiatorUserId) return;

  const viewerUserId = getSyncViewerUserIdForClient()?.trim() || initiatorUserId;
  if (!viewerUserId) return;

  const peer = args.peerUserId?.trim() ?? "";
  const busyKind: CallBusyKind = args.busyKind === "caller" ? "caller" : "peer";
  const serverSessionId = args.sessionId?.trim() ?? "";
  const minute = Math.floor(Date.now() / 60_000);
  const tmpSessionId =
    serverSessionId ||
    `peer-busy:${busyKind}:${roomId}:${peer || "unknown"}:${args.callKind}:${minute}`;

  appendLocalCallChatMessage({
    roomId,
    tmpSessionId,
    initiatorUserId,
    callKind: args.callKind,
    resolvedEvent: busyKind === "caller" ? "caller_busy" : "peer_busy",
  });

  cmCallFlow("peer_busy", {
    roomId,
    peerUserId: peer || undefined,
    callKind: args.callKind,
    viewerUserId,
    busyKind,
    sessionId: serverSessionId || undefined,
  });
}
