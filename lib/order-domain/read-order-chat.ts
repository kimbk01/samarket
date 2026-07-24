import type { SupabaseClient } from "@supabase/supabase-js";
import { clearNotificationTarget } from "@/lib/notifications/notification-targets";
import {
  fetchDomainBadgeAuthorityPayload,
  invalidateNotificationBadgeCache,
} from "@/lib/notifications/pipeline/notify-badge-service";

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
    }
  | { ok: false; error: string; status?: number };

type StoreOrderChatContext = {
  orderId: string;
  roomId: string;
  storeId: string | null;
  buyerUserId: string;
  ownerUserId: string;
  role: OrderChatReadRole;
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
  };
}

async function resolveLastReadMessageId(
  sb: SupabaseClient<any>,
  roomId: string,
  explicitId?: string | null
): Promise<string | null> {
  const explicit = explicitId?.trim() ?? "";
  if (explicit) return explicit;
  const { data } = await sb
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return trim((data as { id?: unknown } | null)?.id) || null;
}

async function markOrderParticipantRead(
  sb: SupabaseClient<any>,
  ctx: StoreOrderChatContext,
  userId: string,
  lastReadMessageId: string | null,
  now: string
): Promise<number> {
  const patch: Record<string, unknown> = {
    unread_count: 0,
    last_read_at: now,
  };
  if (lastReadMessageId) patch.last_read_message_id = lastReadMessageId;
  const { data, error } = await sb
    .from("community_messenger_participants")
    .update(patch)
    .eq("room_id", ctx.roomId)
    .eq("user_id", userId)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

async function markOrderChatEventsRead(
  sb: SupabaseClient<any>,
  ctx: StoreOrderChatContext,
  userId: string,
  now: string
): Promise<number> {
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", userId)
    .eq("type", "store_order_message")
    .eq("unread", true)
    .is("read_at", null)
    .or(
      [
        `room_id.eq.${ctx.roomId}`,
        `display_payload->legacyMeta->>room_id.eq.${ctx.roomId}`,
        `display_payload->legacyMeta->>order_id.eq.${ctx.orderId}`,
        `display_payload->>orderId.eq.${ctx.orderId}`,
        `display_payload->>order_id.eq.${ctx.orderId}`,
      ].join(",")
    )
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

async function clearOrderChatTarget(
  sb: SupabaseClient<any>,
  ctx: StoreOrderChatContext,
  userId: string
): Promise<void> {
  if (ctx.role === "owner") {
    await clearNotificationTarget(sb, {
      userId,
      targetType: "owner_order_chat",
      targetId: ctx.roomId,
      storeId: ctx.storeId,
    });
    return;
  }
  await clearNotificationTarget(sb, {
    userId,
    targetType: "buyer_order",
    targetId: ctx.orderId,
  });
}

async function countParticipantUnread(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<number> {
  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("unread_count")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return 1;
  return Math.max(0, Math.floor(Number((data as { unread_count?: unknown }).unread_count) || 0));
}

async function countOrderChatTargetUnread(
  sb: SupabaseClient<any>,
  ctx: StoreOrderChatContext,
  userId: string
): Promise<number> {
  const targetType = ctx.role === "owner" ? "owner_order_chat" : "buyer_order";
  const targetId = ctx.role === "owner" ? ctx.roomId : ctx.orderId;
  const { data, error } = await sb
    .from("notification_targets")
    .select("id")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("is_unread", true)
    .limit(50);
  if (error) return 1;
  return data?.length ?? 0;
}

async function countOrderChatEventUnread(
  sb: SupabaseClient<any>,
  ctx: StoreOrderChatContext,
  userId: string
): Promise<number> {
  const { data, error } = await sb
    .from("notification_events")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "store_order_message")
    .eq("unread", true)
    .or(
      [
        `room_id.eq.${ctx.roomId}`,
        `display_payload->legacyMeta->>room_id.eq.${ctx.roomId}`,
        `display_payload->legacyMeta->>order_id.eq.${ctx.orderId}`,
        `display_payload->>orderId.eq.${ctx.orderId}`,
        `display_payload->>order_id.eq.${ctx.orderId}`,
      ].join(",")
    )
    .limit(50);
  if (error) return 1;
  return data?.length ?? 0;
}

export async function readOrderChat(
  sb: SupabaseClient<any>,
  input: ReadOrderChatInput
): Promise<ReadOrderChatResult> {
  const userId = input.userId.trim();
  if (!userId) return { ok: false, error: "unauthorized", status: 401 };
  const ctx = await loadStoreOrderChatContext(sb, input);
  if (!ctx) return { ok: false, error: "order_chat_not_found_or_forbidden", status: 404 };

  const now = new Date().toISOString();
  const lastReadMessageId = await resolveLastReadMessageId(sb, ctx.roomId, input.lastReadMessageId);
  const [updatedParticipantUnreadCount, updatedNotificationEventCount] = await Promise.all([
    markOrderParticipantRead(sb, ctx, userId, lastReadMessageId, now),
    markOrderChatEventsRead(sb, ctx, userId, now),
    clearOrderChatTarget(sb, ctx, userId),
  ]).then(([participantCount, eventCount]) => [participantCount, eventCount] as const);

  invalidateNotificationBadgeCache(userId);

  const [participantUnreadAfter, targetUnreadAfter, eventUnreadAfter, domain] = await Promise.all([
    countParticipantUnread(sb, ctx.roomId, userId),
    countOrderChatTargetUnread(sb, ctx, userId),
    countOrderChatEventUnread(sb, ctx, userId),
    fetchDomainBadgeAuthorityPayload(sb, userId, { force: true }),
  ]);

  if (participantUnreadAfter !== 0 || targetUnreadAfter !== 0 || eventUnreadAfter !== 0) {
    return {
      ok: false,
      error: "order_chat_read_incomplete",
      status: 409,
    };
  }

  return {
    ok: true,
    orderId: ctx.orderId,
    roomId: ctx.roomId,
    role: ctx.role,
    participantUnreadAfter,
    targetUnreadAfter,
    eventUnreadAfter,
    updatedParticipantUnreadCount,
    updatedNotificationTargetCount: 1,
    updatedNotificationEventCount,
    nextBadgeTotal: Math.max(0, Math.floor(Number(domain.projection?.bellTotal) || 0)),
    nativeBadgeTotal: Math.max(0, Math.floor(Number(domain.projection?.appIconTotal) || 0)),
    surface: ctx.role === "owner" ? "owner_commerce_inbox" : "bottom_nav_delivery",
    ...(ctx.role === "owner" ? { ownerFabSurface: "fab_owner_order_chat" as const } : {}),
  };
}
