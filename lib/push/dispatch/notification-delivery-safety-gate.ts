import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
import { isNotificationBlockedForRecipient } from "@/lib/notifications/policy/notification-block-policy";

export type NotificationDeliverySuppressReason =
  | "event_expired"
  | "blocked"
  | "group_banned"
  | "group_membership_inactive"
  | "destination_deleted"
  | "destination_forbidden"
  | "safety_check_failed";

export type NotificationDeliverySafetyDecision =
  | { allow: true }
  | { allow: false; reason: NotificationDeliverySuppressReason };

function payloadRecord(row: NotificationEventRow): Record<string, unknown> {
  return row.display_payload && typeof row.display_payload === "object"
    ? (row.display_payload as Record<string, unknown>)
    : {};
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nestedMeta(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.legacyMeta && typeof payload.legacyMeta === "object"
    ? (payload.legacyMeta as Record<string, unknown>)
    : {};
}

function isExpired(row: NotificationEventRow, nowMs: number): boolean {
  const payload = payloadRecord(row);
  const explicit = trim(payload.expires_at ?? payload.expiresAt);
  const explicitMs = explicit ? Date.parse(explicit) : NaN;
  if (Number.isFinite(explicitMs)) return explicitMs <= nowMs;
  const createdMs = Date.parse(row.created_at);
  if (!Number.isFinite(createdMs)) return true;
  const ttlMs =
    getNotificationEventDefinition(row.type).ttlSeconds * 1_000;
  return createdMs + ttlMs <= nowMs;
}

async function evaluateMessengerRoom(
  sb: SupabaseClient<any>,
  row: NotificationEventRow
): Promise<NotificationDeliverySafetyDecision | null> {
  const roomId = trim(row.room_id);
  if (!roomId) return null;
  const { data: room, error: roomError } = await sb
    .from("community_messenger_rooms")
    .select("id, room_type, room_status, deleted_at")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) {
    if ((roomError as { code?: string }).code === "22P02") return null;
    return { allow: false, reason: "safety_check_failed" };
  }
  if (!room) return null;
  if (
    trim((room as { deleted_at?: unknown }).deleted_at) ||
    (trim((room as { room_status?: unknown }).room_status) &&
      trim((room as { room_status?: unknown }).room_status) !== "active")
  ) {
    return { allow: false, reason: "destination_deleted" };
  }

  const { data: participant, error: participantError } = await sb
    .from("community_messenger_participants")
    .select("user_id, left_at")
    .eq("room_id", roomId)
    .eq("user_id", row.user_id)
    .maybeSingle();
  if (participantError) {
    return { allow: false, reason: "safety_check_failed" };
  }
  if (
    !participant ||
    trim((participant as { left_at?: unknown }).left_at)
  ) {
    return { allow: false, reason: "group_membership_inactive" };
  }

  const definition = getNotificationEventDefinition(row.type);
  const roomType = trim((room as { room_type?: unknown }).room_type);
  if (definition.domain === "group" || roomType === "private_group") {
    const { data: ban, error: banError } = await sb
      .from("community_messenger_group_bans")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", row.user_id)
      .is("unbanned_at", null)
      .maybeSingle();
    if (banError) return { allow: false, reason: "safety_check_failed" };
    if (ban) return { allow: false, reason: "group_banned" };
  }
  return { allow: true };
}

async function evaluateLegacyTradeRoom(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  roomId: string = trim(row.room_id)
): Promise<NotificationDeliverySafetyDecision> {
  if (!roomId) return { allow: false, reason: "destination_forbidden" };
  const { data, error } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id, room_status")
    .eq("id", roomId)
    .maybeSingle();
  if (error) return { allow: false, reason: "safety_check_failed" };
  if (!data) return { allow: false, reason: "destination_deleted" };
  const sellerId = trim((data as { seller_id?: unknown }).seller_id);
  const buyerId = trim((data as { buyer_id?: unknown }).buyer_id);
  if (row.user_id !== sellerId && row.user_id !== buyerId) {
    return { allow: false, reason: "destination_forbidden" };
  }
  const status = trim((data as { room_status?: unknown }).room_status);
  if (status === "blocked" || status === "report_hold") {
    return { allow: false, reason: "destination_forbidden" };
  }
  return { allow: true };
}

async function evaluateTradeStatus(
  sb: SupabaseClient<any>,
  row: NotificationEventRow
): Promise<NotificationDeliverySafetyDecision> {
  const payload = payloadRecord(row);
  const meta = nestedMeta(payload);
  // P-14 (docs/audit/notification-full-reaudit-2026-10-27.md): legacyRefId 는 상품 id 계약이 아니다
  // (거래 완료 = 메신저 방 id, 제안 = 제안 id, 제재·신고·광고 = 각 요청 id). 그 id 로 posts 를 찾다가
  // 거래 완료 푸시가 전부 「destination_deleted」로 막혔다. 명시된 상품 id 만 상품 상태를 검사하고,
  // 상품 id 없이 거래 채팅(product_chat_id)만 있으면 그 채팅의 당사자인지 검사한다.
  const productId = trim(meta.product_id);
  if (!productId) {
    const productChatId = trim(meta.product_chat_id);
    return productChatId ? evaluateLegacyTradeRoom(sb, row, productChatId) : { allow: true };
  }
  const { data, error } = await sb
    .from("posts")
    .select("id, status")
    .eq("id", productId)
    .maybeSingle();
  if (error) return { allow: false, reason: "safety_check_failed" };
  if (!data || trim((data as { status?: unknown }).status) === "hidden") {
    return { allow: false, reason: "destination_deleted" };
  }
  return { allow: true };
}

async function evaluateStoreOrder(
  sb: SupabaseClient<any>,
  row: NotificationEventRow
): Promise<NotificationDeliverySafetyDecision> {
  const payload = payloadRecord(row);
  const meta = nestedMeta(payload);
  // P-1 (docs/audit/notification-full-reaudit-2026-10-27.md): order_status 행에는 주문이 아닌 알림도 있다
  // (회원·매장 포인트 충전, 배달 광고 결과, 리뷰 — legacyRefId = 충전·광고 요청 id). 그 id 로 store_orders 를
  // 찾다가 「destination_deleted」로 필수 푸시까지 막혔다. 주문 알림(store_order_* 또는 meta.order_id)과
  // 주문 메시지만 주문 존재를 검사하고, 나머지는 다른 유형과 같이 허용한다.
  const metaOrderId = trim(meta.order_id);
  const kind = trim(meta.kind ?? payload.kind);
  if (
    row.type !== "store_order_message" &&
    !metaOrderId &&
    !kind.startsWith("store_order_")
  ) {
    return { allow: true };
  }
  const orderId = metaOrderId || trim(payload.legacyRefId) || trim(row.room_id);
  if (!orderId) return { allow: false, reason: "destination_forbidden" };
  const { data, error } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, stores(owner_user_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { allow: false, reason: "safety_check_failed" };
  if (!data) return { allow: false, reason: "destination_deleted" };
  const buyerId = trim(
    (data as { buyer_user_id?: unknown }).buyer_user_id
  );
  const stores = (
    data as {
      stores?:
        | { owner_user_id?: unknown }
        | Array<{ owner_user_id?: unknown }>
        | null;
    }
  ).stores;
  const store = Array.isArray(stores) ? stores[0] : stores;
  const ownerId = trim(store?.owner_user_id);
  if (row.user_id !== buyerId && row.user_id !== ownerId) {
    return { allow: false, reason: "destination_forbidden" };
  }
  return { allow: true };
}

export async function evaluateNotificationDeliverySafety(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  nowMs = Date.now()
): Promise<NotificationDeliverySafetyDecision> {
  if (isExpired(row, nowMs)) {
    return { allow: false, reason: "event_expired" };
  }
  const actorId = trim(row.actor_user_id);
  if (
    actorId &&
    (await isNotificationBlockedForRecipient(
      sb,
      row.user_id,
      actorId
    ))
  ) {
    return { allow: false, reason: "blocked" };
  }

  const definition = getNotificationEventDefinition(row.type);
  if (
    definition.domain === "general_direct" ||
    definition.domain === "group" ||
    definition.domain === "trade" ||
    definition.domain === "store_order"
  ) {
    const messengerDecision = await evaluateMessengerRoom(sb, row);
    if (messengerDecision) return messengerDecision;
    if (
      definition.domain === "general_direct" ||
      definition.domain === "group"
    ) {
      return {
        allow: false,
        reason: row.room_id
          ? "destination_deleted"
          : "destination_forbidden",
      };
    }
  }
  if (row.type === "trade_message") {
    return evaluateLegacyTradeRoom(sb, row);
  }
  if (row.type === "trade_status") {
    return evaluateTradeStatus(sb, row);
  }
  if (
    row.type === "store_order_message" ||
    row.type === "order_status" ||
    row.type === "delivery_status"
  ) {
    return evaluateStoreOrder(sb, row);
  }
  return { allow: true };
}
