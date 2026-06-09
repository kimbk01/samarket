"use client";

import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { appendLocalCallChatMessage } from "@/lib/community-messenger/call-chat-local-append";
import { cmCallFlow } from "@/lib/community-messenger/cm-call-debug";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/**
 * `peer_busy` — call_session 없이 발신자 채팅 타임라인·디버그 로그에만 남긴다.
 */
export function appendLocalCallChatMessageForPeerBusy(args: {
  roomId: string;
  initiatorUserId: string;
  peerUserId?: string | null;
  callKind: CommunityMessengerCallKind;
}): void {
  const roomId = args.roomId.trim();
  const initiatorUserId = args.initiatorUserId.trim();
  if (!roomId || !initiatorUserId) return;

  const viewerUserId = getSyncViewerUserIdForClient()?.trim() || initiatorUserId;
  if (!viewerUserId) return;

  const peer = args.peerUserId?.trim() ?? "";
  const minute = Math.floor(Date.now() / 60_000);
  const tmpSessionId = `peer-busy:${roomId}:${peer || "unknown"}:${args.callKind}:${minute}`;

  appendLocalCallChatMessage({
    roomId,
    tmpSessionId,
    initiatorUserId,
    callKind: args.callKind,
    resolvedEvent: "peer_busy",
    persistToApi: false,
  });

  cmCallFlow("peer_busy", {
    roomId,
    peerUserId: peer || undefined,
    callKind: args.callKind,
    viewerUserId,
  });
}
