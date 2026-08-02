/**
 * Order Domain — store_order room read.
 *
 * Room Unread Authority v1:
 *   readOrderChat → dibay_mark_room_read_atomic (single TX)
 * DO NOT: parallel counter-only reset · skip message_reads · Phase 8B wiring
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchDomainBadgeAuthorityPayload,
  invalidateNotificationBadgeCache,
} from "@/lib/notifications/pipeline/notify-badge-service";
import { DIBAY_MARK_ROOM_READ_ATOMIC_RPC } from "@/lib/messenger/contracts/room-unread-authority";
import {
  buildSoMarkReadIdempotencyKey,
  resolveRoomReadableTipMessageId,
} from "@/lib/community-messenger/room-unread-authority-rpc";

export type OrderChatReadRole = "owner" | "customer";

export type ReadOrderChatInput = {
  userId: string;
  orderId: string;
  roomId: string;
  role?: OrderChatReadRole;
  lastReadMessageId?: string | null;
};

export type ReadOrderChatResult =
  | {
      ok: true;
      orderId: string;
      roomId: string;
      role: OrderChatReadRole;
      participantUnreadAfter: number;
      targetUnreadAfter: number;
      eventUnreadAfter: number;
      updatedParticipantUnreadCount: number;
      updatedNotificationTargetCount: number;
      updatedNotificationEventCount: number;
      nextBadgeTotal: number;
      nativeBadgeTotal: number;
      surface: "bottom_nav_delivery" | "owner_commerce_inbox";
      ownerFabSurface?: "fab_owner_order_chat";
      authority: "room_unread_v1";
    }
  | { ok: false; error: string; status?: number };

type StoreOrderChatContext = {
  orderId: string;
  roomId: string;
  storeId: string | null;
  buyerUserId: string;
  ownerUserId: string;
  role: OrderChatReadRole;
  domainIdentityKey: string;
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function loadStoreOrderChatContext(
  sb: SupabaseClient<any>,
  input: ReadOrderChatInput
): Promise<StoreOrderChatContext | null> {
  const uid = input.userId.trim();
  const orderId = input.orderId.trim();
  const roomId = input.roomId.trim();
  if (!uid || !orderId || !roomId) return null;

  const { data, error } = await sb
    .from("store_orders")
    .select("id, store_id, buyer_user_id, community_messenger_room_id, stores(owner_user_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data || typeof data !== "object") return null;

  const row = data as {
    id?: unknown;
    store_id?: unknown;
    buyer_user_id?: unknown;
    community_messenger_room_id?: unknown;
    stores?: { owner_user_id?: unknown } | Array<{ owner_user_id?: unknown }> | null;
  };
  const resolvedOrderId = trim(row.id);
  const resolvedRoomId = trim(row.community_messenger_room_id);
  if (resolvedOrderId !== orderId || resolvedRoomId !== roomId) return null;

  const buyerUserId = trim(row.buyer_user_id);
  const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
  const ownerUserId = trim(store?.owner_user_id);
  if (!buyerUserId || !ownerUserId) return null;

  const actualRole: OrderChatReadRole | null =
    uid === ownerUserId ? "owner" : uid === buyerUserId ? "customer" : null;
  if (!actualRole) return null;
  if (input.role && input.role !== actualRole) return null;

  return {
    orderId,
    roomId,
    storeId: trim(row.store_id) || null,
    buyerUserId,
    ownerUserId,
    role: actualRole,
    domainIdentityKey: `store_order:${orderId}`,
  };
}

export async function readOrderChat(
  sb: SupabaseClient<any>,
  input: ReadOrderChatInput
): Promise<ReadOrderChatResult> {
  const userId = input.userId.trim();
  if (!userId) return { ok: false, error: "unauthorized", status: 401 };
  const ctx = await loadStoreOrderChatContext(sb, input);
  if (!ctx) return { ok: false, error: "order_chat_not_found_or_forbidden", status: 404 };

  const through = trim(input.lastReadMessageId) || null;
  const tipMessageId = through
    ? ""
    : await resolveRoomReadableTipMessageId(sb, ctx.roomId);
  const idempotencyKey = buildSoMarkReadIdempotencyKey({
    userId,
    roomId: ctx.roomId,
    role: ctx.role,
    throughMessageId: through,
    tipMessageId,
  });

  const { data: rpcRaw, error: rpcError } = await (sb as any).rpc(DIBAY_MARK_ROOM_READ_ATOMIC_RPC, {
    p_viewer_id: userId,
    p_room_id: ctx.roomId,
    p_chat_domain: "store_order",
    p_domain_identity_key: ctx.domainIdentityKey,
    p_viewer_role: ctx.role,
    p_store_id: ctx.storeId,
    p_order_id: ctx.orderId,
    p_read_through_message_id: through,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    return { ok: false, error: String(rpcError.message ?? "mark_room_read_failed"), status: 500 };
  }

  const payload = rpcRaw as {
    ok?: unknown;
    error?: unknown;
    unreadCount?: unknown;
    clearedEventCount?: unknown;
    clearedTargetCount?: unknown;
  } | null;

  if (!payload || payload.ok !== true) {
    const reason = typeof payload?.error === "string" ? payload.error : "mark_room_read_denied";
    const status =
      reason === "forbidden" || reason === "not_buyer" || reason === "not_owner" ? 403 : 409;
    return { ok: false, error: reason, status };
  }

  const participantUnreadAfter = Math.max(0, Math.floor(Number(payload.unreadCount) || 0));
  if (participantUnreadAfter !== 0) {
    return { ok: false, error: "order_chat_read_incomplete", status: 409 };
  }

  invalidateNotificationBadgeCache(userId);
  /**
   * Slice 2-4 R2 — owner read must invalidate Owner Hub/FAB route cache (12s TTL),
   * not only store-order unread memory. Otherwise Hub can stay stale-high while
   * byStore authority is already fresh → strict hubPlus1 appears to fail.
   * `invalidateOwnerHubBadgeCache` also clears hub store-order memory.
   */
  if (ctx.role === "owner") {
    const { invalidateOwnerHubBadgeCache } = await import("@/lib/chats/owner-hub-badge-cache");
    invalidateOwnerHubBadgeCache(userId);
  }
  const domain = await fetchDomainBadgeAuthorityPayload(sb, userId, { force: true });

  return {
    ok: true,
    orderId: ctx.orderId,
    roomId: ctx.roomId,
    role: ctx.role,
    participantUnreadAfter: 0,
    targetUnreadAfter: 0,
    eventUnreadAfter: 0,
    updatedParticipantUnreadCount: 1,
    updatedNotificationTargetCount: Math.max(0, Math.floor(Number(payload.clearedTargetCount) || 0)),
    updatedNotificationEventCount: Math.max(0, Math.floor(Number(payload.clearedEventCount) || 0)),
    nextBadgeTotal: Math.max(0, Math.floor(Number(domain.projection?.bellTotal) || 0)),
    nativeBadgeTotal: Math.max(0, Math.floor(Number(domain.projection?.appIconTotal) || 0)),
    surface: ctx.role === "owner" ? "owner_commerce_inbox" : "bottom_nav_delivery",
    ...(ctx.role === "owner" ? { ownerFabSurface: "fab_owner_order_chat" as const } : {}),
    authority: "room_unread_v1",
  };
}
