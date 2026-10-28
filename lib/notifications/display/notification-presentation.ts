/**
 * 알림 표시 SSOT (Owner 시안 2026-10-29 · docs/audit/notification-presentation-ssot-2026-10-29.md).
 *
 * 한 알림 → 한 표시값. Android 트레이(FCM data)·iOS 잠금화면(APNs)·앱 안 배너가 이 값을 그대로 그린다.
 * 기기별로 종류·사진·묶음·글자색을 따로 판정하지 않는다. 분류는 알림센터 분류 SSOT
 * (`member-notification-domain`)를 그대로 쓴다.
 *
 * 통화(수신·부재중·취소)는 통화 규정 대상이라 여기서 다루지 않는다 — `isCallPresentationExcluded`.
 */
import {
  classifyMemberNotificationDomain,
  memberNotificationDomainRowFromInbox,
} from "@/lib/notifications/member-notification-domain";

export type NotificationPresentationKind =
  | "message"
  | "missed_call"
  | "order"
  | "notice"
  | "system"
  | "community"
  | "trade";

export type NotificationPresentation = {
  kind: NotificationPresentationKind;
  title: string;
  body: string;
  /** 사람·매장 사진(https). null 이면 DIBAY 로고 */
  imageUrl: string | null;
  imageShape: "circle" | "rounded";
  /** 같은 키끼리 한 묶음 (room:<id> · order:<id> · <kind>) */
  threadKey: string;
  bodyTone: "normal" | "alert";
  occurredAt: string | null;
};

export type NotificationPresentationInput = {
  notification_type?: string | null;
  title?: string | null;
  body?: string | null;
  meta?: Record<string, unknown> | null;
  occurred_at?: string | null;
  /** 알림센터 행 분류 필드 — 있으면 함께 쓴다 */
  push_kind?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
  campaign_type?: string | null;
};

/** FCM data / APNs 사용자 필드 이름 — 네이티브 렌더러와 같은 이름 (계약) */
export const NOTIFICATION_PRESENTATION_WIRE_KEYS = {
  kind: "presKind",
  imageUrl: "presImageUrl",
  imageShape: "presImageShape",
  threadKey: "presThreadKey",
  bodyTone: "presBodyTone",
} as const;

const CALL_NOTIFICATION_TYPES = new Set([
  "community_messenger_incoming_call",
  "community_messenger_missed_call",
  "community_messenger_call_canceled",
]);

const MESSAGE_META_KINDS = new Set([
  "group_message",
  "mention_message",
  "pin_message",
  "trade_chat",
  "trade_message",
  "store_order_message",
  "community_chat",
]);

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function displayPayload(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  const d = meta?.display_payload;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
}

/**
 * 알림 행 → 푸시 경로(`notify-push-dispatcher`)는 원래 meta 를 `display_payload.legacyMeta` 안에 둔다
 * (주문 알림 store_image_url·order_id). 최상위 값이 우선이고, 없으면 legacyMeta 값을 쓴다 — 실기 2026-10-29.
 */
function effectiveMeta(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  const legacy = displayPayload(meta)?.legacyMeta;
  if (!legacy || typeof legacy !== "object") return meta;
  return { ...(legacy as Record<string, unknown>), ...(meta ?? {}) };
}

function httpsOrNull(v: unknown): string | null {
  const s = text(v);
  return s.startsWith("https://") ? s : null;
}

/** 통화 알림은 통화 규정 대상 — 이 SSOT 의 표시값을 싣지 않는다. */
export function isCallPresentationExcluded(input: Pick<NotificationPresentationInput, "notification_type">): boolean {
  return CALL_NOTIFICATION_TYPES.has(text(input.notification_type));
}

function resolveKind(input: NotificationPresentationInput, meta: Record<string, unknown> | null): NotificationPresentationKind {
  const type = text(input.notification_type);
  const metaKind = text(meta?.kind);
  if (type === "community_messenger_missed_call") return "missed_call";
  if (type === "chat" && (MESSAGE_META_KINDS.has(metaKind) || text(meta?.room_id ?? meta?.roomId))) {
    return "message";
  }
  const domain = classifyMemberNotificationDomain(
    memberNotificationDomainRowFromInbox({
      push_kind: input.push_kind,
      notification_type: input.notification_type,
      event_type: input.event_type ?? (text(meta?.event_type) || null),
      bell_presentation_type: input.bell_presentation_type,
      campaign_type: input.campaign_type,
      meta,
    })
  );
  switch (domain) {
    case "delivery":
      return "order";
    case "notice":
    case "marketing":
      return "notice";
    case "trade":
      return "trade";
    case "community":
      return "community";
    default:
      return "system";
  }
}

function resolveImageUrl(kind: NotificationPresentationKind, meta: Record<string, unknown> | null): string | null {
  const display = displayPayload(meta);
  switch (kind) {
    case "message":
    case "missed_call":
      return httpsOrNull(meta?.sender_avatar_url ?? meta?.senderAvatarUrl ?? display?.senderAvatarUrl);
    case "order":
      return httpsOrNull(meta?.store_image_url ?? meta?.storeImageUrl ?? display?.storeImageUrl);
    default:
      return null;
  }
}

function resolveThreadKey(kind: NotificationPresentationKind, meta: Record<string, unknown> | null): string {
  if (kind === "message") {
    const roomId = text(meta?.room_id ?? meta?.roomId);
    if (roomId) return `room:${roomId}`;
  }
  if (kind === "order") {
    const orderId = text(meta?.order_id ?? meta?.orderId);
    if (orderId) return `order:${orderId}`;
  }
  return kind;
}

export function resolveNotificationPresentation(input: NotificationPresentationInput): NotificationPresentation {
  const meta = effectiveMeta(input.meta && typeof input.meta === "object" ? input.meta : null);
  const kind = resolveKind(input, meta);
  return {
    kind,
    title: text(input.title),
    body: text(input.body),
    imageUrl: resolveImageUrl(kind, meta),
    imageShape: kind === "message" || kind === "missed_call" || kind === "community" ? "circle" : "rounded",
    threadKey: resolveThreadKey(kind, meta),
    bodyTone: kind === "missed_call" ? "alert" : "normal",
    occurredAt: text(input.occurred_at) || null,
  };
}

/** FCM data·APNs 사용자 필드로 싣는 값 (문자열만 · 비어 있으면 생략) */
export function notificationPresentationWireFields(p: NotificationPresentation): Record<string, string> {
  const k = NOTIFICATION_PRESENTATION_WIRE_KEYS;
  const fields: Record<string, string> = {
    [k.kind]: p.kind,
    [k.imageShape]: p.imageShape,
    [k.threadKey]: p.threadKey,
    [k.bodyTone]: p.bodyTone,
  };
  if (p.imageUrl) fields[k.imageUrl] = p.imageUrl;
  return fields;
}
