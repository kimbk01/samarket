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
      lastReadMessageId?: string | null;
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
  requestMessengerHubBadgeResync("participant_unread_changed");
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
    if (
      d.type !== "cm.room.message_sent" &&
      d.type !== "cm.room.bump" &&
      d.type !== "cm.room.local_unread" &&
      d.type !== "cm.home.merge_room_summary" &&
      d.type !== "cm.room.incoming_message" &&
      d.type !== "cm.room.read" &&
      d.type !== "cm.room.summary_patch"
    )
      return;
    if (typeof d.roomId !== "string" || !d.roomId.trim()) return;
    if (d.type === "cm.room.local_unread") {
      if (typeof d.viewerUserId !== "string" || !d.viewerUserId.trim()) return;
      if (typeof d.unreadCount !== "number" || !Number.isFinite(d.unreadCount) || d.unreadCount < 0) return;
    }
    if (d.type === "cm.home.merge_room_summary") {
      if (typeof d.viewerUserId !== "string" || !d.viewerUserId.trim()) return;
      if (!d.summary || typeof d.summary !== "object" || typeof (d.summary as { id?: unknown }).id !== "string") return;
    }
    if (d.type === "cm.room.incoming_message" || d.type === "cm.room.read" || d.type === "cm.room.summary_patch") {
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
