/**
 * Notification Event attention_key — product SSOT helper.
 *
 * Bell digit counts unread rows AFTER writers end prior attentions for the same key.
 * DO NOT invent a second counter store; keep history rows; end via read_at.
 *
 * @see docs/notifications/notification-event-ssot.md
 */

export type NotificationAttentionKeyInput = {
  type?: string | null;
  category?: string | null;
  dedupe_key?: string | null;
  room_id?: string | null;
  display_payload?: unknown;
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function payloadRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function orderIdFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const legacyMeta = payloadRecord(payload.legacyMeta);
  return (
    trim(legacyMeta?.order_id) ||
    trim(payload.legacyRefId) ||
    trim(payload.orderId) ||
    trim(payload.order_id) ||
    trim(payload.store_order_id) ||
    ""
  );
}

function metaKind(payload: Record<string, unknown> | null): string {
  const legacyMeta = payloadRecord(payload?.legacyMeta);
  return trim(legacyMeta?.kind) || trim(payload?.kind);
}

/**
 * Stable attention identity for supersede / digit semantics.
 * Same attention_key ⇒ at most one unread row should remain after writer policy.
 */
export function resolveNotificationAttentionKey(input: NotificationAttentionKeyInput): string {
  const type = trim(input.type);
  const dedupe = trim(input.dedupe_key);
  const payload = payloadRecord(input.display_payload);
  const roomId = trim(input.room_id) || trim(payload?.roomId) || trim(payload?.room_id);
  const orderId = orderIdFromPayload(payload);
  const kind = metaKind(payload).toLowerCase();

  if (type === "missed_call" || trim(input.category) === "missed_call") {
    return dedupe || `missed_call:${roomId || "unknown"}`;
  }

  if (
    type === "chat_message" ||
    type === "group_message" ||
    type === "mention_message" ||
    type === "pin_message" ||
    type === "trade_message" ||
    type === "store_order_message"
  ) {
    // Message attentions end by room_id read (many unread events → one room).
    // attention_key for digit compression is room-scoped; list still shows events until read.
    return roomId ? `message_room:${roomId}` : dedupe || `message:${type}`;
  }

  if (type === "trade_status" || trim(input.category) === "trade_status") {
    const productId =
      trim(payloadRecord(payload?.legacyMeta)?.product_id) ||
      trim(payload?.legacyRefId) ||
      trim(payload?.product_id);
    return productId ? `trade_status:${productId}` : dedupe || "trade_status:unknown";
  }

  if (type === "order_status" || type === "delivery_status" || trim(input.category) === "order_status") {
    if (!orderId) return dedupe || `order_status:${kind || "unknown"}`;

    // Buyer status chain → one attention per order.
    if (kind === "store_order_owner_status" || dedupe.includes(":buyer:owner_status:")) {
      return `order_status:buyer:${orderId}`;
    }
    // Owner intake / cancel / reminders share order intake attention.
    if (
      kind === "store_order_created" ||
      kind === "store_order_accept_reminder_30s" ||
      kind === "store_order_accept_reminder_60s" ||
      kind === "store_order_buyer_cancelled" ||
      kind === "store_order_payment_completed" ||
      kind === "store_order_refund_requested" ||
      kind === "store_order_sold_out" ||
      dedupe.includes(":owner:new_order:") ||
      dedupe.includes(":owner:accept_reminder:") ||
      dedupe.includes(":owner:buyer_cancel:")
    ) {
      return `order_status:owner_intake:${orderId}`;
    }
    // Fee / points are separate owner attentions.
    if (kind.startsWith("store_point_") || dedupe.includes("store_point")) {
      return `order_status:owner_fee:${orderId}`;
    }
    return `order_status:${orderId}:${kind || "generic"}`;
  }

  if (
    type === "admin_notice" ||
    type === "admin_marketing_banner" ||
    type === "notice_published" ||
    type === "inquiry_answered" ||
    type === "inbox_message_received"
  ) {
    return dedupe || `admin:${type}`;
  }

  return dedupe || `${type || "event"}:unknown`;
}
