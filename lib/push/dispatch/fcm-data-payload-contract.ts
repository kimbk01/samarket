import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { applyPushTransportEnvelope } from "@/lib/notifications/badge-authority-rebuild/push-routing-transport";
import { buildCommunityPostNotificationPath } from "@/lib/notifications/community-post-notification-destination";
import type { DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

export type FcmPushType =
  | "incoming_call"
  | "missed_call"
  | "call_canceled"
  | "call_rejected"
  | "call_ended"
  | "call_answered_elsewhere"
  | "chat_message"
  | "group_message"
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
    opts?.call_push_kind === "call_rejected" ||
    opts?.call_push_kind === "call_ended" ||
    opts?.call_push_kind === "call_answered_elsewhere" ||
    out.notification_type === "community_messenger_call_canceled"
  ) {
    return opts?.call_push_kind ?? "call_canceled";
  }

  const meta = metaObj(out);
  const metaKind = meta ? trimText(meta.kind) : "";

  if (out.notification_type === "chat") {
    if (metaKind === "group_message") return "group_message";
    if (metaKind === "mention_message") return "group_message";
    if (metaKind === "pin_message") return "group_message";
    if (metaKind === "trade_chat") return "trade_message";
    if (metaKind === "trade_message") return "trade_message";
    if (metaKind === "store_order_message") return "delivery_order";
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
  const chatDomain = meta ? trimText(meta.chat_domain ?? meta.chatDomain) : "";
  const domainIdentityKey = meta
    ? trimText(meta.domain_identity_key ?? meta.domainIdentityKey)
    : "";
  if (chatDomain) {
    fields.chatDomain = chatDomain;
    fields.chat_domain = chatDomain;
  }
  if (domainIdentityKey) {
    fields.domainIdentityKey = domainIdentityKey;
    fields.domain_identity_key = domainIdentityKey;
  }
  const itemId = meta ? trimText(meta.item_id ?? meta.itemId) : "";
  const orderId = meta ? trimText(meta.order_id ?? meta.orderId) : "";
  const storeId = meta ? trimText(meta.store_id ?? meta.storeId) : "";
  const groupId = meta ? trimText(meta.group_id ?? meta.groupId) : "";
  if (itemId) fields.itemId = itemId;
  if (orderId) fields.orderId = orderId;
  if (storeId) fields.storeId = storeId;
  if (groupId) fields.groupId = groupId;
}

function appendDomainEnvelopeFields(
  fields: Record<string, unknown>,
  meta: Record<string, unknown> | null
): void {
  if (!meta) return;
  const chatDomain = trimText(meta.chat_domain ?? meta.chatDomain);
  const domainIdentityKey = trimText(meta.domain_identity_key ?? meta.domainIdentityKey);
  const roomId = trimText(meta.room_id ?? meta.roomId);
  if (chatDomain) {
    fields.chatDomain = chatDomain;
    fields.chat_domain = chatDomain;
  }
  if (domainIdentityKey) {
    fields.domainIdentityKey = domainIdentityKey;
    fields.domain_identity_key = domainIdentityKey;
  }
  if (roomId && !fields.roomId) fields.roomId = roomId;
}

function appendMessageDisplayFields(
  fields: Record<string, unknown>,
  meta: Record<string, unknown> | null
): void {
  if (!meta) return;
  const display =
    meta.display_payload && typeof meta.display_payload === "object"
      ? (meta.display_payload as Record<string, unknown>)
      : null;

  const senderName = trimText(meta.sender_name ?? meta.senderName ?? display?.senderName);
  const senderAvatarUrl = trimText(
    meta.sender_avatar_url ?? meta.senderAvatarUrl ?? display?.senderAvatarUrl
  );
  const roomName = trimText(meta.room_name ?? meta.roomName ?? display?.roomName);
  const roomKind = trimText(meta.room_kind ?? meta.roomKind ?? display?.roomKind);
  const previewKind = trimText(meta.preview_kind ?? meta.previewKind ?? display?.previewKind);
  const contextLabel = trimText(meta.context_label ?? meta.contextLabel ?? display?.contextLabel);
  const routeUrl = trimText(display?.routeUrl ?? meta.route_url ?? meta.routeUrl);
  const supportCaseId = trimText(
    display?.supportCaseId ?? display?.support_case_id ?? meta.supportCaseId ?? meta.support_case_id
  );
  const category = trimText(meta.category ?? display?.category);
  const campaignId = trimText(meta.campaign_id ?? meta.campaignId ?? display?.campaignId);
  const resolverKey = trimText(
    meta.deeplink_resolver_key ?? meta.deeplinkResolverKey
  );
  const pushImageUrl = trimText(
    meta.push_image_url ?? meta.pushImageUrl ?? display?.imageUrl ?? display?.pushImageUrl
  );

  if (senderName) fields.senderName = senderName;
  if (senderAvatarUrl) {
    fields.senderAvatarUrl = senderAvatarUrl;
    fields.senderAvatar = senderAvatarUrl;
  }
  if (roomName) fields.roomName = roomName;
  if (roomKind) fields.roomKind = roomKind;
  if (previewKind) fields.previewKind = previewKind;
  if (contextLabel) fields.contextLabel = contextLabel;
  if (routeUrl) fields.routeUrl = routeUrl;
  if (supportCaseId) {
    fields.supportCaseId = supportCaseId;
    fields.support_case_id = supportCaseId;
  }
  if (category) fields.category = category;
  if (campaignId) fields.campaignId = campaignId;
  if (resolverKey) {
    fields.deeplinkResolverKey = resolverKey;
    fields.deeplink_resolver_key = resolverKey;
  }
  if (pushImageUrl) {
    fields.imageUrl = pushImageUrl;
    fields.bigPictureUrl = pushImageUrl;
  }
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

  const badgeFromOpts = opts?.badge_count;
  const badgeFromMeta = meta ? Number(meta.badge_count ?? meta.badgeCount) : NaN;
  const badgeCount =
    typeof badgeFromOpts === "number" && Number.isFinite(badgeFromOpts)
      ? Math.max(0, Math.trunc(badgeFromOpts))
      : Number.isFinite(badgeFromMeta)
        ? Math.max(0, Math.trunc(badgeFromMeta))
        : 0;
  // Slice 2-6 — always send absolute badge (including 0) so Native clear is not omitted.
  fields.badgeCount = String(badgeCount);

  const eventId =
    trimText(opts?.notification_event_id) ||
    (meta ? trimText(meta.notification_event_id ?? meta.notificationEventId) : "") ||
    resolveNotificationId(out, tag);
  if (eventId) {
    fields.notificationEventId = eventId;
  }

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
    case "call_canceled":
    case "call_rejected":
    case "call_ended":
    case "call_answered_elsewhere": {
      const sessionId = trimText(base.sessionId) || (meta ? trimText(meta.session_id ?? meta.sessionId) : "");
      if (sessionId) {
        appendCallFields(fields, meta, sessionId);
        fields.url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
        fields.call_push_kind = type;
        fields.tag = `samarket-incoming-call-${sessionId}`;
        if (type === "call_answered_elsewhere" && meta) {
          const answeredDevice = trimText(meta.answered_device_id ?? meta.answeredDeviceId);
          if (answeredDevice) fields.answeredDeviceId = answeredDevice;
        }
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
        fields.roomType = "direct";
        fields.url = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
        fields.tag = `samarket-message-room-${roomId}`;
        const messageId = meta ? trimText(meta.message_id ?? meta.messageId) : "";
        const senderId = meta ? trimText(meta.sender_id ?? meta.senderId) : "";
        if (messageId) fields.messageId = messageId;
        if (senderId) fields.senderId = senderId;
      }
      break;
    }
    case "group_message": {
      const roomId = meta ? trimText(meta.room_id ?? meta.roomId) : "";
      if (roomId) {
        fields.roomId = roomId;
        fields.roomType = "group";
        fields.url = `/community-messenger/rooms/${encodeURIComponent(roomId)}?type=group`;
        fields.tag = `samarket-group-room-${roomId}`;
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
        fields.url = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
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
        fields.url = buildCommunityPostNotificationPath(postId);
      }
      if (commentId) fields.commentId = commentId;
      break;
    }
    default:
      break;
  }

  if (
    type === "chat_message" ||
    type === "group_message" ||
    type === "trade_message" ||
    type === "delivery_order" ||
    type === "notification"
  ) {
    appendMessageDisplayFields(fields, meta);
  }

  appendDomainEnvelopeFields(fields, meta);

  const eventKey = meta ? trimText(meta.event_key ?? meta.eventKey) : "";
  const androidChannelId = meta ? trimText(meta.android_channel_id ?? meta.androidChannelId) : "";
  const iosSoundName = meta ? trimText(meta.ios_sound_name ?? meta.iosSoundName) : "";
  const soundAssetId = meta ? trimText(meta.sound_asset_id ?? meta.soundAssetId) : "";
  const ringtoneUrl = meta ? trimText(meta.ringtone_url ?? meta.ringtoneUrl) : "";
  const ringtonePolicy = meta ? trimText(meta.ringtone_policy ?? meta.ringtonePolicy) : "";
  if (eventKey) fields.eventKey = eventKey;
  if (androidChannelId) fields.androidChannelId = androidChannelId;
  if (iosSoundName) fields.sound = iosSoundName;
  if (soundAssetId) fields.soundAssetId = soundAssetId;
  if (type === "incoming_call" && eventKey) {
    fields.callSoundEventKey = eventKey;
    fields.event_key = eventKey;
  }
  if (type === "incoming_call" && soundAssetId) fields.sound_asset_id = soundAssetId;
  if (type === "incoming_call" && ringtonePolicy) {
    fields.ringtone_policy = ringtonePolicy;
    fields.ringtonePolicy = ringtonePolicy;
  }
  if (type === "incoming_call" && ringtoneUrl && ringtonePolicy !== "silent") {
    fields.ringtoneUrl = ringtoneUrl;
    fields.ringtone_url = ringtoneUrl;
  }

  // Device local fail-closed identity — always present for recipient match after logout/A→B.
  // Does not replace transport envelope recipientMemberId (may be null for owner_c).
  if (out.user_id) {
    fields.targetUserId = out.user_id;
    fields.userId = out.user_id;
  }

  // Gate 3 Step 9 — transport envelope (A/B/C identity). badgeCount stays absolute echo.
  const metaKind = meta ? trimText(meta.kind) : "";
  const eventClassWire = meta ? trimText(meta.eventClass ?? meta.event_class) : "";
  const campaignChannelWire = meta
    ? trimText(meta.campaignChannel ?? meta.campaign_channel)
    : "";
  applyPushTransportEnvelope(fields, {
    type,
    eventType: type,
    eventId: eventId || null,
    notificationId: resolveNotificationId(out, tag),
    path: typeof fields.url === "string" ? fields.url : url,
    userId: out.user_id,
    storeId: meta ? trimText(meta.store_id ?? meta.storeId) : "",
    roomId: meta ? trimText(meta.room_id ?? meta.roomId) : "",
    metaKind,
    chatDomain: meta ? trimText(meta.chat_domain ?? meta.chatDomain) : "",
    dedupeKey: eventId || null,
    pushOnlyPromotion:
      out.notification_type === "marketing" ||
      metaKind === "admin_marketing_banner" ||
      eventClassWire === "admin_marketing",
    eventClass: eventClassWire || null,
    campaignChannel: campaignChannelWire || null,
  });

  // P0 additive envelope flat fields (string) — do not replace legacy keys.
  if (meta) {
    const schemaVersion = trimText(meta.schemaVersion ?? meta.schema_version);
    if (schemaVersion) fields.schemaVersion = schemaVersion;
    if (eventClassWire) fields.eventClass = eventClassWire;
    if (campaignChannelWire) fields.campaignChannel = campaignChannelWire;
    const targetKind = trimText(meta.targetKind ?? meta.target_kind);
    if (targetKind) fields.targetKind = targetKind;
    const targetTab = trimText(meta.targetTab ?? meta.target_tab);
    if (targetTab) fields.targetTab = targetTab;
    const targetNotificationId = trimText(
      meta.targetNotificationId ?? meta.target_notification_id
    );
    if (targetNotificationId) fields.targetNotificationId = targetNotificationId;
    const targetApprovedRoute = trimText(
      meta.targetApprovedRoute ?? meta.target_approved_route
    );
    if (targetApprovedRoute) fields.targetApprovedRoute = targetApprovedRoute;
    const operationType = trimText(meta.operationType ?? meta.operation_type);
    if (operationType) fields.operationType = operationType;
  }

  return fields;
}

function extractOrderIdFromUrl(url: string): string {
  const m = url.match(/\/orders\/(?:store|owner\/orders)\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}
