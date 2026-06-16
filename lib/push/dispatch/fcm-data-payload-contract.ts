import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

export type FcmPushType =
  | "incoming_call"
  | "missed_call"
  | "call_canceled"
  | "chat_message"
  | "trade_message"
  | "delivery_order"
  | "community_comment"
  | "notification";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function metaObj(out: NotificationSideEffectPayloadOut): Record<string, unknown> | null {
  if (!out.meta || typeof out.meta !== "object") return null;
  return out.meta as Record<string, unknown>;
}

function resolveRelativeUrl(out: NotificationSideEffectPayloadOut): string {
  const relative = trimText(out.link_url);
  if (relative.startsWith("/")) return relative;
  const absolute = trimText(out.link_url_absolute);
  if (absolute) {
    try {
      const parsed = new URL(absolute);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return absolute;
    }
  }
  return "/";
}

function resolveNotificationId(out: NotificationSideEffectPayloadOut, tag: string): string {
  const meta = metaObj(out);
  const fromMeta = meta ? trimText(meta.notification_id ?? meta.notificationId) : "";
  if (fromMeta) return fromMeta;
  if (tag) return tag;
  return `${out.user_id}:${out.occurred_at}`;
}

function resolveTtlMs(meta: Record<string, unknown> | null): number {
  const raw = meta ? Number(meta.ttl_ms ?? meta.ttlMs) : NaN;
  if (Number.isFinite(raw) && raw >= 60_000 && raw <= 120_000) return Math.trunc(raw);
  return 60_000;
}

export function resolveFcmPushType(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): FcmPushType {
  if (opts?.call_push_kind === "incoming_call" || out.notification_type === "community_messenger_incoming_call") {
    return "incoming_call";
  }
  if (opts?.call_push_kind === "missed_call" || out.notification_type === "community_messenger_missed_call") {
    return "missed_call";
  }
  if (
    opts?.call_push_kind === "call_canceled" ||
    out.notification_type === "community_messenger_call_canceled"
  ) {
    return "call_canceled";
  }

  const meta = metaObj(out);
  const metaKind = meta ? trimText(meta.kind) : "";

  if (out.notification_type === "chat") {
    if (metaKind === "trade_chat") return "trade_message";
    if (metaKind === "community_chat") return "chat_message";
    if (meta?.room_id) return "chat_message";
  }

  if (metaKind === "community_comment") return "community_comment";

  if (out.notification_type === "commerce" || metaKind.startsWith("store_order")) {
    return "delivery_order";
  }

  return "notification";
}

function appendCallFields(
  fields: Record<string, unknown>,
  meta: Record<string, unknown> | null,
  sessionId: string
): void {
  fields.callId = sessionId;
  fields.sessionId = sessionId;
  const roomId = meta ? trimText(meta.room_id ?? meta.roomId) : "";
  if (roomId) fields.roomId = roomId;
}

export function buildFcmDataFields(
  out: NotificationSideEffectPayloadOut,
  opts: DispatchPushOptions | undefined,
  base: Record<string, unknown>
): Record<string, unknown> {
  const meta = metaObj(out);
  const type = resolveFcmPushType(out, opts);
  const tag = trimText(String(base.tag ?? ""));
  const url = resolveRelativeUrl(out);

  const fields: Record<string, unknown> = {
    ...base,
    type,
    title: out.title,
    body: out.body ?? "",
    url,
    notificationId: resolveNotificationId(out, tag),
    createdAt: out.occurred_at,
  };

  switch (type) {
    case "incoming_call": {
      const sessionId = trimText(base.sessionId) || (meta ? trimText(meta.session_id ?? meta.sessionId) : "");
      if (sessionId) {
        appendCallFields(fields, meta, sessionId);
        fields.url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
        fields.action = "incoming_call";
        fields.dibay_call = "1";
        fields.call_push_kind = opts?.call_push_kind ?? "incoming_call";
        fields.priority = "high";
        fields.ttlMs = resolveTtlMs(meta);
        fields.sentAt = new Date().toISOString();
        const callerId = meta ? trimText(meta.caller_id ?? meta.callerId) : "";
        const callerName = meta ? trimText(meta.caller_name ?? meta.callerName) : "";
        const callerAvatar = meta ? trimText(meta.caller_avatar ?? meta.callerAvatar) : "";
        const startedAt = meta ? trimText(meta.started_at ?? meta.startedAt) : "";
        const expiresAt = meta ? trimText(meta.expires_at ?? meta.expiresAt) : "";
        const callKind = meta ? trimText(meta.kind ?? meta.call_kind ?? meta.callKind) : "";
        if (callerId) fields.callerId = callerId;
        if (callerName) fields.callerName = callerName;
        if (callerAvatar) {
          fields.callerAvatar = callerAvatar;
          fields.callerAvatarUrl = callerAvatar;
        }
        if (startedAt) fields.startedAt = startedAt;
        if (expiresAt) fields.expiresAt = expiresAt;
        if (callKind) {
          fields.callType = callKind === "video" ? "video" : "audio";
          fields.mediaType = fields.callType;
          fields.kind = callKind;
        }
        fields.tag = `samarket-incoming-call-${sessionId}`;
      }
      break;
    }
    case "call_canceled": {
      const sessionId = trimText(base.sessionId) || (meta ? trimText(meta.session_id ?? meta.sessionId) : "");
      if (sessionId) {
        appendCallFields(fields, meta, sessionId);
        fields.url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
        fields.call_push_kind = "call_canceled";
        fields.tag = `samarket-incoming-call-${sessionId}`;
      }
      break;
    }
    case "missed_call": {
      const sessionId = trimText(base.sessionId) || (meta ? trimText(meta.session_id ?? meta.sessionId) : "");
      if (sessionId) {
        appendCallFields(fields, meta, sessionId);
        const roomId = meta ? trimText(meta.room_id ?? meta.roomId) : "";
        fields.url = roomId
          ? `/community-messenger/rooms/${encodeURIComponent(roomId)}?focus=call-history&callId=${encodeURIComponent(sessionId)}`
          : `/community-messenger/calls/logs?callId=${encodeURIComponent(sessionId)}`;
        fields.call_push_kind = opts?.call_push_kind ?? "missed_call";
        const callerId = meta ? trimText(meta.caller_id ?? meta.callerId) : "";
        const callerName = meta ? trimText(meta.caller_name ?? meta.callerName) : "";
        const missedAt = meta ? trimText(meta.missed_at ?? meta.missedAt) : out.occurred_at;
        if (roomId) fields.roomId = roomId;
        if (callerId) fields.callerId = callerId;
        if (callerName) fields.callerName = callerName;
        if (missedAt) fields.missedAt = missedAt;
        fields.tag = `samarket-missed-call-${sessionId}`;
      }
      break;
    }
    case "chat_message": {
      const roomId = meta ? trimText(meta.room_id ?? meta.roomId) : "";
      if (roomId) {
        fields.roomId = roomId;
        fields.url = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
        fields.tag = `samarket-message-room-${roomId}`;
        const messageId = meta ? trimText(meta.message_id ?? meta.messageId) : "";
        const senderId = meta ? trimText(meta.sender_id ?? meta.senderId) : "";
        if (messageId) fields.messageId = messageId;
        if (senderId) fields.senderId = senderId;
      }
      break;
    }
    case "trade_message": {
      const roomId = meta ? trimText(meta.room_id ?? meta.roomId) : "";
      if (roomId) {
        fields.roomId = roomId;
        fields.url = `/chats/${encodeURIComponent(roomId)}`;
        const tradeId = meta ? trimText(meta.trade_id ?? meta.tradeId ?? meta.product_id ?? meta.productId) : "";
        if (tradeId) fields.tradeId = tradeId;
        const messageId = meta ? trimText(meta.message_id ?? meta.messageId) : "";
        const senderId = meta ? trimText(meta.sender_id ?? meta.senderId) : "";
        if (messageId) fields.messageId = messageId;
        if (senderId) fields.senderId = senderId;
      }
      break;
    }
    case "delivery_order": {
      const orderId =
        (meta ? trimText(meta.order_id ?? meta.orderId) : "") ||
        extractOrderIdFromUrl(url);
      const storeId = meta ? trimText(meta.store_id ?? meta.storeId) : "";
      if (orderId) {
        fields.orderId = orderId;
        fields.url = url.includes("/owner/") ? url : `/orders/store/${encodeURIComponent(orderId)}`;
      }
      if (storeId) fields.storeId = storeId;
      break;
    }
    case "community_comment": {
      const postId = meta ? trimText(meta.post_id ?? meta.postId) : "";
      const commentId = meta ? trimText(meta.comment_id ?? meta.commentId) : "";
      if (postId) {
        fields.postId = postId;
        fields.url = `/philife/posts/${encodeURIComponent(postId)}`;
      }
      if (commentId) fields.commentId = commentId;
      break;
    }
    default:
      break;
  }

  return fields;
}

function extractOrderIdFromUrl(url: string): string {
  const m = url.match(/\/orders\/(?:store|owner\/orders)\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}
