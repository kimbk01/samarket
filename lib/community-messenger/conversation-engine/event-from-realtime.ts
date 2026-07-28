import { isChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  conversationIdForRoom,
  resolveConversationDomain,
} from "@/lib/community-messenger/conversation-engine/identity";
import type {
  ConversationEvent,
  ConversationPreviewKind,
  ConversationReadEvent,
  ConversationUpsertEvent,
} from "@/lib/community-messenger/conversation-engine/types";
import type { ConversationUpsertBroadcastPayload } from "@/lib/community-messenger/conversation-engine/conversation-upsert-channel";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function revisionFromIso(iso: string): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function previewKindFromMessageType(mt: string): ConversationPreviewKind {
  if (mt === "call_stub") return "call";
  if (
    mt === "image" ||
    mt === "file" ||
    mt === "system" ||
    mt === "voice" ||
    mt === "sticker" ||
    mt === "community_post_share"
  ) {
    return mt;
  }
  return "text";
}

function callStatusFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const status = (meta as { callStatus?: unknown }).callStatus;
  return typeof status === "string" ? status.trim().toLowerCase() : null;
}

function sessionIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const s = (meta as { sessionId?: unknown }).sessionId;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

export function conversationUpsertFromMessageRow(
  row: Record<string, unknown>,
  domainHint?: string | null
): ConversationUpsertEvent | null {
  const roomId = trimText(row.room_id);
  if (!roomId) return null;
  const createdAt = trimText(row.created_at);
  if (!createdAt) return null;
  const messageId = trimText(row.id) || createdAt;
  const mt = trimText(row.message_type) || "text";
  const content = trimText(row.content) || (mt === "call_stub" ? "통화" : "새 메시지");
  const kind = previewKindFromMessageType(mt);
  const domain = resolveConversationDomain(domainHint, "general_direct");
  return {
    type: "conversation_upsert",
    eventId: `msg:${messageId}:${kind}:${callStatusFromMeta(row.metadata) ?? ""}`,
    conversationId: conversationIdForRoom(roomId),
    roomId,
    domain,
    lastActivityAt: createdAt,
    revision: revisionFromIso(createdAt),
    preview: {
      kind,
      text: content,
      messageId,
      callStatus: kind === "call" ? callStatusFromMeta(row.metadata) : null,
      sessionId: kind === "call" ? sessionIdFromMeta(row.metadata) : null,
    },
  };
}

export function conversationUpsertFromRoomTip(
  roomId: string,
  tip: { lastMessage: string; lastMessageType?: string; lastMessageAt: string },
  domainHint?: string | null
): ConversationUpsertEvent | null {
  const rid = trimText(roomId);
  const at = trimText(tip.lastMessageAt);
  if (!rid || !at) return null;
  const mt = trimText(tip.lastMessageType) || "text";
  const kind = previewKindFromMessageType(mt);
  return {
    type: "conversation_upsert",
    eventId: `room_tip:${rid}:${at}:${kind}:${trimText(tip.lastMessage).slice(0, 40)}`,
    conversationId: conversationIdForRoom(rid),
    roomId: rid,
    domain: resolveConversationDomain(domainHint, "general_direct"),
    lastActivityAt: at,
    revision: revisionFromIso(at),
    preview: {
      kind,
      text: trimText(tip.lastMessage) || "새 메시지",
      messageId: null,
    },
  };
}

export function conversationReadFromParticipant(
  roomId: string,
  unreadCount: number,
  domainHint?: string | null,
  eventSuffix?: string
): ConversationReadEvent | null {
  const rid = trimText(roomId);
  if (!rid) return null;
  return {
    type: "conversation_read",
    eventId: `read:${rid}:${unreadCount}:${eventSuffix ?? Date.now()}`,
    conversationId: conversationIdForRoom(rid),
    roomId: rid,
    domain: resolveConversationDomain(domainHint, "general_direct"),
    unreadCount: Math.max(0, Number(unreadCount) || 0),
  };
}

export function conversationEventFromUpsertBroadcast(
  payload: ConversationUpsertBroadcastPayload
): ConversationEvent | null {
  const roomId = trimText(payload.roomId || payload.canonicalRoomId);
  if (!roomId || !payload.eventId) return null;
  const domainRaw = trimText(payload.domain || payload.chatDomain);
  const domain = isChatDomain(domainRaw) ? domainRaw : "general_direct";
  const kindRaw = trimText(payload.preview?.kind) || "text";
  const kind = (kindRaw === "call_stub" ? "call" : kindRaw) as ConversationUpsertEvent["preview"]["kind"];
  return {
    type: "conversation_upsert",
    eventId: payload.eventId,
    conversationId: conversationIdForRoom(roomId),
    roomId,
    domain,
    domainIdentityKey: payload.domainIdentityKey ?? null,
    lastActivityAt: payload.lastActivityAt,
    revision: payload.revision || revisionFromIso(payload.lastActivityAt),
    preview: {
      kind: previewKindFromMessageType(kind === "call" ? "call_stub" : kind),
      text: String(payload.preview?.text ?? ""),
      messageId: payload.preview?.messageId ?? null,
      callStatus: payload.preview?.callStatus ?? null,
      sessionId: payload.preview?.sessionId ?? null,
      callId: payload.preview?.callId ?? null,
    },
    unreadCount: payload.unreadCount,
  };
}
