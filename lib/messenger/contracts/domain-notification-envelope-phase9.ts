/**
 * Phase 9 — Domain Notification Envelope SSOT.
 * production Push / FCM / APNs / OS Badge wiring 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { isChatDomain, requireChatDomain } from "@/lib/chat-domain/chat-domain";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";

export const MESSENGER_NOTIFICATION_SCHEMA_VERSION = 1 as const;

export const PHASE9_NOTIFICATION_PRODUCTION_WIRING = false as const;

export type MessengerNotificationBadgeTarget = "app_icon";

export type MessengerNotificationType = "message_created" | "message_updated";

export type StoreOrderSurfaceRole = "customer" | "owner";

export type GeneralDirectDisplayContext = Readonly<{
  peerDisplayName: string | null;
  peerAvatarUrl: string | null;
  messagePreview: string;
}>;

export type GroupDisplayContext = Readonly<{
  groupName: string | null;
  groupImageUrl: string | null;
  senderName: string | null;
  messagePreview: string;
}>;

export type TradeDisplayContext = Readonly<{
  productTitle: string | null;
  productImageUrl: string | null;
  peerDisplayName: string | null;
  messagePreview: string;
  /** 있으면 preview 대체에 쓰려는 시도 — reject */
  productSummary?: string | null;
  tradeStatusLabel?: string | null;
}>;

export type StoreOrderDisplayContext = Readonly<{
  surfaceRole: StoreOrderSurfaceRole;
  orderId: string;
  storeId: string;
  storeName: string | null;
  storeImageUrl: string | null;
  customerName: string | null;
  customerAvatarUrl: string | null;
  messagePreview: string;
  /** preview 대체 시도 — reject */
  orderSummary?: string | null;
  orderStatusLabel?: string | null;
  ownerMemberName?: string | null;
  ownerMemberAvatarUrl?: string | null;
}>;

export type MessengerNotificationDisplayContext =
  | GeneralDirectDisplayContext
  | GroupDisplayContext
  | TradeDisplayContext
  | StoreOrderDisplayContext;

export type MessengerNotificationEnvelope = Readonly<{
  schemaVersion: number;
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
  eventId: string;
  viewerUserId: string;
  senderUserId: string;
  notificationType: MessengerNotificationType;
  badgeTarget: MessengerNotificationBadgeTarget;
  soundKey: string;
  occurredAt: string;
  displayContext: MessengerNotificationDisplayContext;
}>;

const FORBIDDEN_REINFERENCE_KEYS = [
  "roomType",
  "room_type",
  "direct_key",
  "directKey",
  "title",
  "pathname",
  "contextMeta",
  "context_meta",
  "notificationCopy",
  "notification_copy",
  "bodyForInference",
  "titleForInference",
] as const;

const NOTIFICATION_TYPES = new Set<string>(["message_created", "message_updated"]);

function assertNoReinferenceFields(raw: Record<string, unknown>): void {
  for (const k of FORBIDDEN_REINFERENCE_KEYS) {
    if (k in raw && raw[k] != null) {
      throw new Error(`dibay_notification_envelope_reinference_forbidden:${k}`);
    }
  }
  const meta = raw.contextMeta ?? raw.context_meta;
  if (meta && typeof meta === "object" && meta !== null && "kind" in (meta as object)) {
    throw new Error("dibay_notification_envelope_reinference_forbidden:context_meta_kind");
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`dibay_notification_envelope_missing:${field}`);
  }
  return value.trim();
}

function assertIdentityPrefix(chatDomain: ChatDomain, identityKey: string): void {
  const key = requireDomainIdentityKey(identityKey);
  const prefix = `${chatDomain}:`;
  if (!key.startsWith(prefix)) {
    throw new Error(`dibay_notification_envelope_identity_prefix_mismatch:${chatDomain}`);
  }
}

function parseDisplayContext(
  chatDomain: ChatDomain,
  raw: unknown
): MessengerNotificationDisplayContext {
  if (!raw || typeof raw !== "object") {
    throw new Error("dibay_notification_envelope_missing:displayContext");
  }
  const ctx = raw as Record<string, unknown>;
  const messagePreview =
    typeof ctx.messagePreview === "string" ? ctx.messagePreview.trim() : "";

  if (chatDomain === "general_direct") {
    return {
      peerDisplayName: typeof ctx.peerDisplayName === "string" ? ctx.peerDisplayName : null,
      peerAvatarUrl: typeof ctx.peerAvatarUrl === "string" ? ctx.peerAvatarUrl : null,
      messagePreview,
    };
  }
  if (chatDomain === "group") {
    return {
      groupName: typeof ctx.groupName === "string" ? ctx.groupName : null,
      groupImageUrl: typeof ctx.groupImageUrl === "string" ? ctx.groupImageUrl : null,
      senderName: typeof ctx.senderName === "string" ? ctx.senderName : null,
      messagePreview,
    };
  }
  if (chatDomain === "trade") {
    if (
      (typeof ctx.productSummary === "string" && ctx.productSummary.trim()) ||
      (typeof ctx.tradeStatusLabel === "string" && ctx.tradeStatusLabel.trim())
    ) {
      // status/summary present is allowed only if messagePreview still wins;
      // replacing preview is rejected in domain resolver.
    }
    return {
      productTitle: typeof ctx.productTitle === "string" ? ctx.productTitle : null,
      productImageUrl: typeof ctx.productImageUrl === "string" ? ctx.productImageUrl : null,
      peerDisplayName: typeof ctx.peerDisplayName === "string" ? ctx.peerDisplayName : null,
      messagePreview,
      productSummary: typeof ctx.productSummary === "string" ? ctx.productSummary : null,
      tradeStatusLabel: typeof ctx.tradeStatusLabel === "string" ? ctx.tradeStatusLabel : null,
    };
  }
  // store_order
  const surfaceRole = ctx.surfaceRole;
  if (surfaceRole !== "customer" && surfaceRole !== "owner") {
    throw new Error("dibay_notification_envelope_missing:surfaceRole");
  }
  return {
    surfaceRole,
    orderId: requireNonEmptyString(ctx.orderId, "orderId"),
    storeId: requireNonEmptyString(ctx.storeId, "storeId"),
    storeName: typeof ctx.storeName === "string" ? ctx.storeName : null,
    storeImageUrl: typeof ctx.storeImageUrl === "string" ? ctx.storeImageUrl : null,
    customerName: typeof ctx.customerName === "string" ? ctx.customerName : null,
    customerAvatarUrl: typeof ctx.customerAvatarUrl === "string" ? ctx.customerAvatarUrl : null,
    messagePreview,
    orderSummary: typeof ctx.orderSummary === "string" ? ctx.orderSummary : null,
    orderStatusLabel: typeof ctx.orderStatusLabel === "string" ? ctx.orderStatusLabel : null,
    ownerMemberName: typeof ctx.ownerMemberName === "string" ? ctx.ownerMemberName : null,
    ownerMemberAvatarUrl:
      typeof ctx.ownerMemberAvatarUrl === "string" ? ctx.ownerMemberAvatarUrl : null,
  };
}

/**
 * fail-closed envelope 검증. production push writer 아님.
 */
export function parseMessengerNotificationEnvelope(
  rawInput: unknown
): MessengerNotificationEnvelope {
  if (PHASE9_NOTIFICATION_PRODUCTION_WIRING) {
    throw new Error("dibay_phase9_notification_production_wiring_forbidden");
  }
  if (!rawInput || typeof rawInput !== "object") {
    throw new Error("dibay_notification_envelope_invalid");
  }
  const raw = rawInput as Record<string, unknown>;
  assertNoReinferenceFields(raw);

  if (raw.schemaVersion !== MESSENGER_NOTIFICATION_SCHEMA_VERSION) {
    throw new Error("dibay_notification_envelope_schema_version");
  }
  if (typeof raw.chatDomain !== "string" || !isChatDomain(raw.chatDomain)) {
    throw new Error("dibay_notification_envelope_missing:chatDomain");
  }
  const chatDomain = requireChatDomain(raw.chatDomain);
  const domainIdentityKey = requireNonEmptyString(raw.domainIdentityKey, "domainIdentityKey");
  assertIdentityPrefix(chatDomain, domainIdentityKey);

  const notificationType = requireNonEmptyString(raw.notificationType, "notificationType");
  if (!NOTIFICATION_TYPES.has(notificationType)) {
    throw new Error(`dibay_notification_envelope_type_forbidden:${notificationType}`);
  }
  if (raw.badgeTarget !== "app_icon") {
    throw new Error("dibay_notification_envelope_badge_target");
  }

  return {
    schemaVersion: MESSENGER_NOTIFICATION_SCHEMA_VERSION,
    chatDomain,
    domainIdentityKey,
    roomId: requireNonEmptyString(raw.roomId, "roomId"),
    eventId: requireNonEmptyString(raw.eventId, "eventId"),
    viewerUserId: requireNonEmptyString(raw.viewerUserId, "viewerUserId"),
    senderUserId: requireNonEmptyString(raw.senderUserId, "senderUserId"),
    notificationType: notificationType as MessengerNotificationType,
    badgeTarget: "app_icon",
    soundKey: requireNonEmptyString(raw.soundKey, "soundKey"),
    occurredAt: requireNonEmptyString(raw.occurredAt, "occurredAt"),
    displayContext: parseDisplayContext(chatDomain, raw.displayContext),
  };
}

export function assertEnvelopeViewer(
  envelope: MessengerNotificationEnvelope,
  expectedViewerUserId: string
): void {
  if (envelope.viewerUserId !== expectedViewerUserId.trim()) {
    throw new Error("dibay_notification_envelope_viewer_mismatch");
  }
}

export function assertPhase9NotificationWiringOff(): void {
  if (PHASE9_NOTIFICATION_PRODUCTION_WIRING) {
    throw new Error("dibay_phase9_notification_production_wiring_must_remain_false");
  }
}
