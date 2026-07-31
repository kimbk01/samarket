/**
 * Room Unread Authority v1 — product invoke helpers (service_role).
 * store_order: use via readOrderChat.
 * general_direct / group / trade: prefer markRoomReadAtomic over legacy open_tail.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC,
  DIBAY_MARK_ROOM_READ_ATOMIC_RPC,
  type RoomUnreadViewerRole,
} from "@/lib/community-messenger/contracts/room-unread-authority";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type MarkRoomReadAtomicResult =
  | {
      ok: true;
      lastReadMessageId: string | null;
      lastReadAt: string | null;
      unreadCount: number;
      duplicateSkipped: boolean;
      lastReadAdvanced: boolean;
      regressionBlocked: boolean;
    }
  | { ok: false; error: string };

export async function markRoomReadAtomic(
  sb: SupabaseClient<any>,
  input: {
    viewerId: string;
    roomId: string;
    chatDomain: ChatDomain;
    domainIdentityKey: string;
    viewerRole: RoomUnreadViewerRole;
    storeId?: string | null;
    orderId?: string | null;
    readThroughMessageId?: string | null;
    idempotencyKey: string;
  }
): Promise<MarkRoomReadAtomicResult> {
  const { data, error } = await (sb as any).rpc(DIBAY_MARK_ROOM_READ_ATOMIC_RPC, {
    p_viewer_id: input.viewerId,
    p_room_id: input.roomId,
    p_chat_domain: input.chatDomain,
    p_domain_identity_key: input.domainIdentityKey,
    p_viewer_role: input.viewerRole,
    p_store_id: input.storeId ?? null,
    p_order_id: input.orderId ?? null,
    p_read_through_message_id: input.readThroughMessageId ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { ok: false, error: String(error.message ?? "mark_room_read_failed") };
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: String(payload?.error ?? "mark_room_read_denied") };
  }
  return {
    ok: true,
    lastReadMessageId: trim(payload.lastReadMessageId) || null,
    lastReadAt: trim(payload.lastReadAt) || null,
    unreadCount: Math.max(0, Math.floor(Number(payload.unreadCount) || 0)),
    duplicateSkipped: payload.duplicateSkipped === true,
    lastReadAdvanced: payload.lastReadAdvanced === true,
    regressionBlocked: payload.regressionBlocked === true,
  };
}

export async function loadRoomDomainForUnreadAuthority(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ chatDomain: ChatDomain; domainIdentityKey: string } | null> {
  const { data, error } = await sb
    .from("community_messenger_rooms")
    .select("chat_domain, domain_identity_key")
    .eq("id", roomId)
    .maybeSingle();
  if (error || !data) return null;
  const chatDomain = trim((data as { chat_domain?: unknown }).chat_domain) as ChatDomain;
  const domainIdentityKey = trim((data as { domain_identity_key?: unknown }).domain_identity_key);
  if (
    chatDomain !== "general_direct" &&
    chatDomain !== "group" &&
    chatDomain !== "trade" &&
    chatDomain !== "store_order"
  ) {
    return null;
  }
  if (!domainIdentityKey) return null;
  return { chatDomain, domainIdentityKey };
}

export async function appendRoomMessageAtomic(
  sb: SupabaseClient<any>,
  input: {
    idempotencyKey: string;
    roomId: string;
    chatDomain: string;
    domainIdentityKey: string;
    senderId: string;
    senderRole?: string;
    messageType: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    countsAsUnread?: boolean;
    clientMessageId?: string | null;
    /** store_order system: insert sender_id NULL while actor drives unread */
    forceNullMessageSender?: boolean;
  }
): Promise<
  | { ok: true; message: Record<string, unknown>; recipientUserIds: string[]; deduped: boolean }
  | { ok: false; error: string; rpcMissing?: boolean }
> {
  const args: Record<string, unknown> = {
    p_idempotency_key: input.idempotencyKey,
    p_room_id: input.roomId,
    p_chat_domain: input.chatDomain,
    p_domain_identity_key: input.domainIdentityKey,
    p_sender_id: input.senderId,
    p_sender_role: input.senderRole ?? "member",
    p_message_type: input.messageType,
    p_content: input.content,
    p_metadata: input.metadata ?? {},
    p_created_at: input.createdAt ?? new Date().toISOString(),
    p_counts_as_unread: input.countsAsUnread !== false,
    p_client_message_id: input.clientMessageId ?? null,
  };
  if (input.forceNullMessageSender) {
    args.p_force_null_message_sender = true;
  }
  const { data, error } = await (sb as any).rpc(DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC, args);
  if (error) {
    const msg = String(error.message ?? "append_failed");
    const rpcMissing =
      /does not exist|schema cache|Could not find the function/i.test(msg) ||
      msg.toLowerCase().includes("dibay_append_room_message_atomic");
    return { ok: false, error: msg, rpcMissing };
  }
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: String(payload?.error ?? "append_denied") };
  }
  const recipientsRaw = payload.recipient_user_ids;
  const recipientUserIds = Array.isArray(recipientsRaw)
    ? recipientsRaw.map((x) => String(x)).filter(Boolean)
    : [];
  return {
    ok: true,
    message: (payload.message as Record<string, unknown>) ?? {},
    recipientUserIds,
    deduped: payload.deduped === true,
  };
}

/** Typed CM send via Room Unread Authority — fail-closed (no insert+apply_unread). */
export async function appendTypedMessengerMessageAtomic(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    senderId: string;
    messageType: "sticker" | "voice" | "file" | "image" | "text" | "system" | "call_stub";
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    clientMessageId?: string | null;
    idempotencyKey: string;
    forceNullMessageSender?: boolean;
    countsAsUnread?: boolean;
  }
): Promise<
  | {
      ok: true;
      messageId: string;
      createdAt: string;
      recipientUserIds: string[];
      deduped: boolean;
      rpcUsed: typeof DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC;
      fallbackUsed: false;
    }
  | { ok: false; error: string; fallbackUsed: false }
> {
  const meta = await loadRoomDomainForUnreadAuthority(sb, input.roomId);
  if (!meta) {
    return { ok: false, error: "room_domain_missing", fallbackUsed: false };
  }
  if (input.forceNullMessageSender && input.messageType !== "system") {
    return { ok: false, error: "null_sender_forbidden", fallbackUsed: false };
  }
  const appended = await appendRoomMessageAtomic(sb, {
    idempotencyKey: input.idempotencyKey,
    roomId: input.roomId,
    chatDomain: meta.chatDomain,
    domainIdentityKey: meta.domainIdentityKey,
    senderId: input.senderId,
    messageType: input.messageType,
    content: input.content,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    countsAsUnread: input.countsAsUnread !== false,
    clientMessageId: input.clientMessageId ?? null,
    forceNullMessageSender: input.forceNullMessageSender === true,
  });
  if (!appended.ok) {
    return { ok: false, error: appended.error, fallbackUsed: false };
  }
  const messageId = String(appended.message.id ?? "").trim();
  const createdAt =
    typeof appended.message.created_at === "string"
      ? appended.message.created_at
      : input.createdAt ?? new Date().toISOString();
  if (!messageId) {
    return { ok: false, error: "append_missing_message_id", fallbackUsed: false };
  }
  return {
    ok: true,
    messageId,
    createdAt,
    recipientUserIds: appended.recipientUserIds,
    deduped: appended.deduped,
    rpcUsed: DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC,
    fallbackUsed: false,
  };
}
