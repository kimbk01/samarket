"use client";

import type {
  CommunityMessengerMessage,
  CommunityMessengerMessageType,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  listPreviewFromMessengerMessageRow,
  messengerClientMessageToInsertRow,
} from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";

export type MessengerBusListPreview = {
  lastMessage: string;
  lastMessageType: CommunityMessengerMessageType;
  lastMessageAt: string;
};

export type MessengerBusEvent =
  | {
      type: "cm.room.message_sent";
      roomId: string;
      clientMessageId?: string;
      at: number;
      /** 신규 클라: 발신자 즉시 목록 동기화 */
      senderUserId?: string;
      listPreview?: MessengerBusListPreview;
    }
  | { type: "cm.room.bump"; roomId: string; at: number }
  | {
      type: "cm.room.local_unread";
      roomId: string;
      viewerUserId: string;
      unreadCount: number;
      at: number;
    }
  | {
      type: "cm.home.merge_room_summary";
      viewerUserId: string;
      summary: CommunityMessengerRoomSummary;
      at: number;
    }
  | {
      type: "cm.room.incoming_message";
      roomId: string;
      viewerUserId: string;
      messageRow: Record<string, unknown>;
      at: number;
    }
  | {
      type: "cm.room.read";
      roomId: string;
      viewerUserId: string;
      lastReadMessageId?: string | null;
      at: number;
    }
  | {
      type: "cm.room.summary_patch";
      roomId: string;
      viewerUserId: string;
      unreadCount?: number;
      /**
       * 상대 `participants.last_read_message_id` Realtime 시 Zustand `lastReadByRoomId`·홈 목록이
       * 다른 탭·창에서도 맞춰지게 한다 (`useMessengerRoomClientPhase1` `onParticipantPostgresForPeerRead`).
       */
      lastReadMessageId?: string | null;
      at: number;
    }
  | {
      /** call_stub terminal — preview만 갱신(lastMessageAt 동일 시 정렬 유지) */
      type: "cm.room.call_stub_preview";
      roomId: string;
      viewerUserId: string;
      preview: MessengerBusListPreview;
      at: number;
    }
  | {
      /** 수신/발신 탭 — 통화 터미널(취소·종료) 시 프리뷰·활성 스냅샷 정리 */
      type: "cm.call.session_terminal";
      sessionId?: string;
      tmpSessionId?: string | null;
      roomId?: string | null;
      initiatorUserId?: string | null;
      callKind?: "voice" | "video" | null;
      status: string;
      at: number;
    }
  | {
      /** 수신 통화 consumed — Global 수신 목록에서 ringing 세션 제거 */
      type: "cm.call.incoming_consumed";
      sessionId: string;
      reason?: string;
      at: number;
    }
  | {
      /** 서버 Realtime broadcast `read_ack` — peer 읽음 커서(안읽음/1 제거) */
      type: "cm.room.peer_read_ack";
      roomId: string;
      readerUserId: string;
      lastReadMessageId: string | null;
      lastReadAt: string | null;
      at: number;
    }
  | {
      /** 친구 승인·거절 등 social graph 변경 후 홈 silent refresh */
      type: "cm.home.social_sync";
      at: number;
    };

const CHANNEL = "samarket:community-messenger";

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  const BC = (globalThis as any).BroadcastChannel as typeof BroadcastChannel | undefined;
  if (!BC) return null;
  try {
    return new BC(CHANNEL);
  } catch {
    return null;
  }
}

/**
 * 전송 확정 직후 — 홈 부트스트랩(다른 탭 포함) + 하단 「메신저」뱃지를 Realtime 대기 없이 맞춘다.
 */
export function syncMessengerHomeAfterOutboundSend(args: {
  roomId: string;
  senderUserId: string;
  message: CommunityMessengerMessage;
  clientMessageId?: string;
}): void {
  const row = messengerClientMessageToInsertRow(args.message);
  const preview = listPreviewFromMessengerMessageRow(row);
  postCommunityMessengerBusEvent({
    type: "cm.room.message_sent",
    roomId: args.roomId,
    clientMessageId: args.clientMessageId,
    at: Date.now(),
    senderUserId: args.senderUserId,
    ...(preview ? { listPreview: preview } : {}),
  });
  requestMessengerHubBadgeResync("participant_unread_changed", {
    roomId: args.roomId,
    participantUnreadDirection: "increase",
  });
}

/** 통화 터미널·동일 stub preview 갱신 — Realtime UPDATE 미수신 보완 */
export function postCommunityMessengerCallStubPreviewBusEvent(args: {
  roomId: string;
  viewerUserId: string;
  preview: MessengerBusListPreview;
}): void {
  const roomId = args.roomId.trim();
  const viewerUserId = args.viewerUserId.trim();
  if (!roomId || !viewerUserId) return;
  postCommunityMessengerBusEvent({
    type: "cm.room.call_stub_preview",
    roomId,
    viewerUserId,
    preview: args.preview,
    at: Date.now(),
  });
}

/** 로컬 취소·거절·종료 직후 다른 탭 `/calls` UI 를 Realtime 대기 없이 닫는다 */
export function postCommunityMessengerCallSessionTerminalBusEvent(args: {
  sessionId?: string;
  tmpSessionId?: string | null;
  roomId?: string | null;
  initiatorUserId?: string | null;
  callKind?: "voice" | "video" | null;
  status: string;
}): void {
  const status = args.status.trim();
  if (!status) return;
  postCommunityMessengerBusEvent({
    type: "cm.call.session_terminal",
    sessionId: args.sessionId,
    tmpSessionId: args.tmpSessionId ?? undefined,
    roomId: args.roomId ?? undefined,
    initiatorUserId: args.initiatorUserId ?? undefined,
    callKind: args.callKind ?? undefined,
    status,
    at: Date.now(),
  });
}

/** 수신 통화가 consumed 되어 Global ringing 목록에서 제거되어야 할 때 */
export function postCommunityMessengerCallIncomingConsumedBusEvent(
  sessionId: string,
  reason?: string
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  postCommunityMessengerBusEvent({
    type: "cm.call.incoming_consumed",
    sessionId: sid,
    reason: reason?.trim() || undefined,
    at: Date.now(),
  });
}

export function postCommunityMessengerBusEvent(ev: MessengerBusEvent): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage(ev);
  } catch {
    /* ignore */
  } finally {
    ch.close();
  }
}

export function onCommunityMessengerBusEvent(handler: (ev: MessengerBusEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMsg = (e: MessageEvent) => {
    const d = e.data as any;
    if (!d || typeof d !== "object") return;
    if (d.type === "cm.call.session_terminal") {
      if (typeof d.status !== "string" || !d.status.trim()) return;
      handler(d as MessengerBusEvent);
      return;
    }
    if (d.type === "cm.call.incoming_consumed") {
      if (typeof d.sessionId !== "string" || !d.sessionId.trim()) return;
      handler(d as MessengerBusEvent);
      return;
    }
    if (
      d.type !== "cm.room.message_sent" &&
      d.type !== "cm.room.bump" &&
      d.type !== "cm.room.local_unread" &&
      d.type !== "cm.home.merge_room_summary" &&
      d.type !== "cm.home.social_sync" &&
      d.type !== "cm.room.incoming_message" &&
      d.type !== "cm.room.read" &&
      d.type !== "cm.room.summary_patch" &&
      d.type !== "cm.room.call_stub_preview" &&
      d.type !== "cm.room.peer_read_ack"
    )
      return;
    if (d.type === "cm.home.social_sync") {
      handler(d as MessengerBusEvent);
      return;
    }
    if (d.type === "cm.room.peer_read_ack") {
      if (typeof d.roomId !== "string" || !d.roomId.trim()) return;
      if (typeof d.readerUserId !== "string" || !d.readerUserId.trim()) return;
      handler(d as MessengerBusEvent);
      return;
    }
    if (d.type !== "cm.home.merge_room_summary") {
      if (typeof d.roomId !== "string" || !d.roomId.trim()) return;
    }
    if (d.type === "cm.room.local_unread") {
      if (typeof d.viewerUserId !== "string" || !d.viewerUserId.trim()) return;
      if (typeof d.unreadCount !== "number" || !Number.isFinite(d.unreadCount) || d.unreadCount < 0) return;
    }
    if (d.type === "cm.home.merge_room_summary") {
      if (typeof d.viewerUserId !== "string" || !d.viewerUserId.trim()) return;
      if (!d.summary || typeof d.summary !== "object" || typeof (d.summary as { id?: unknown }).id !== "string") return;
    }
    if (d.type === "cm.room.incoming_message" || d.type === "cm.room.read" || d.type === "cm.room.summary_patch" || d.type === "cm.room.call_stub_preview") {
      if (typeof d.viewerUserId !== "string" || !d.viewerUserId.trim()) return;
    }
    if (d.type === "cm.room.incoming_message") {
      if (!d.messageRow || typeof d.messageRow !== "object") return;
    }
    handler(d as MessengerBusEvent);
  };
  ch.addEventListener("message", onMsg);
  return () => {
    try {
      ch.removeEventListener("message", onMsg);
      ch.close();
    } catch {
      /* ignore */
    }
  };
}
