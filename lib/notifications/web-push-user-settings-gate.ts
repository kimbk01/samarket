import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";
import type { NotificationPreferenceRecipientRole } from "@/lib/notifications/policy/notification-preference-policy-types";
import { readNormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-storage-reader.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 인박스·푸시 라우팅용 (DB notifications.push_kind 와 정렬) */
export type WebPushKind = "chat" | "trade" | "delivery" | "community" | "notice" | "marketing" | "system";

function resolvePushKind(out: NotificationSideEffectPayloadOut): WebPushKind {
  const meta =
    out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
  const explicit = meta?.push_kind;
  if (
    typeof explicit === "string" &&
    ["chat", "trade", "delivery", "community", "notice", "marketing", "system"].includes(explicit)
  ) {
    return explicit as WebPushKind;
  }
  const nt = String(out.notification_type ?? "").toLowerCase();
  if (nt === "community_messenger_incoming_call") return "chat";
  if (nt === "community_messenger_missed_call") return "chat";
  if (nt === "chat") return "chat";
  if (nt === "commerce") return "delivery";
  if (nt === "system") return "system";
  if (nt === "report") return "community";
  return "trade";
}

function metaRecord(out: NotificationSideEffectPayloadOut): Record<string, unknown> | null {
  return out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
}

function metaKindFromOut(out: NotificationSideEffectPayloadOut): string | null {
  const meta = metaRecord(out);
  const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  return kind.length > 0 ? kind : null;
}

function receiverRoleFromOut(out: NotificationSideEffectPayloadOut): string | null {
  const meta = metaRecord(out);
  const raw = meta?.receiverRole ?? meta?.recipientRole;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Maps side-effect payload to canonical event type for P2-A2 lookup. */
export function resolveWebPushPreferenceEventType(out: NotificationSideEffectPayloadOut): string | null {
  const meta = metaRecord(out);
  if (typeof meta?.event_type === "string" && meta.event_type.trim()) {
    return meta.event_type.trim();
  }
  if (typeof meta?.notification_event_type === "string" && meta.notification_event_type.trim()) {
    return meta.notification_event_type.trim();
  }

  const nt = String(out.notification_type ?? "").trim().toLowerCase();
  if (nt === "community_messenger_missed_call") return "missed_call";
  if (nt === "community_messenger_incoming_call") return "incoming_call_signal";
  if (nt === "commerce") return "order_status";
  if (nt === "marketing") return "admin_marketing_banner";
  if (nt === "report") return "community_activity";
  if (nt === "trade") return "trade_status";
  if (nt === "chat") {
    const kind = metaKindFromOut(out);
    if (kind === "trade_chat") return "trade_message";
    if (kind === "group_chat") return "group_message";
    if (kind === "store_order_message") return "store_order_message";
    return "chat_message";
  }
  if (nt === "system") {
    const kind = metaKindFromOut(out);
    if (kind === "notice_published" || kind === "inquiry_answered" || kind === "admin_notice") {
      return kind;
    }
    return "admin_notice";
  }
  return nt || null;
}

/**
 * Owner role must be explicit via meta receiverRole or P2-A2 owner-scoped policy.
 * Member is the default when role cannot be proven owner-scoped.
 */
export function resolveWebPushPreferenceRecipientRole(
  out: NotificationSideEffectPayloadOut
): NotificationPreferenceRecipientRole {
  const receiverRole = receiverRoleFromOut(out);
  if (receiverRole === "owner") return "owner";

  const metaKind = metaKindFromOut(out);
  const eventType = resolveWebPushPreferenceEventType(out);

  if (metaKind) {
    if (receiverRole === "user" || receiverRole === "member" || receiverRole === "customer") {
      return "member";
    }

    const withOwnerRole = getNotificationPreferencePolicy({
      metaKind,
      eventType,
      recipientRole: "owner",
    });
    if (withOwnerRole.resolutionSource === "meta_kind_recipient_override") {
      return "owner";
    }

    const policy = getNotificationPreferencePolicy({ metaKind, eventType });
    if (policy.resolutionSource === "meta_kind_override" && policy.recipientRole === "owner") {
      return "owner";
    }
  }

  if (eventType) {
    const ownerScoped = getNotificationPreferencePolicy({
      eventType,
      recipientRole: "owner",
    });
    if (
      ownerScoped.resolutionSource === "event_recipient_override" &&
      ownerScoped.recipientRole === "owner" &&
      receiverRole === "owner"
    ) {
      return "owner";
    }
  }

  return "member";
}

export function deriveWebPushKind(out: NotificationSideEffectPayloadOut): WebPushKind {
  return resolvePushKind(out);
}

/** Pure member push decision — P2-A4 snapshot + P2-A3 resolver. */
export function resolveMemberWebPushFromPreferences(
  out: NotificationSideEffectPayloadOut,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  return resolveEffectiveNotificationPreference({
    eventType: resolveWebPushPreferenceEventType(out),
    metaKind: metaKindFromOut(out),
    recipientRole: "member",
    pushKind: deriveWebPushKind(out),
    preferences,
    now,
  }).sendPush;
}

/** Pure Owner push decision — P2-A6 owner snapshot + P2-A3 resolver (no Member toggles). */
export function resolveOwnerWebPushFromPreferences(
  out: NotificationSideEffectPayloadOut,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  return resolveEffectiveNotificationPreference({
    eventType: resolveWebPushPreferenceEventType(out),
    metaKind: metaKindFromOut(out),
    recipientRole: "owner",
    pushKind: deriveWebPushKind(out),
    preferences,
    now,
  }).sendPush;
}

async function shouldSendMemberWebPushForUser(
  svc: SupabaseClient,
  userId: string,
  out: NotificationSideEffectPayloadOut
): Promise<boolean> {
  const now = new Date();
  const preferences = await readNormalizedNotificationPreferenceSnapshot(userId, { now }, svc);
  return resolveMemberWebPushFromPreferences(out, preferences, now);
}

async function shouldSendOwnerWebPushForUser(
  svc: SupabaseClient,
  userId: string,
  out: NotificationSideEffectPayloadOut
): Promise<boolean> {
  const now = new Date();
  const preferences = await readNormalizedNotificationPreferenceSnapshot(userId, { now }, svc);
  return resolveOwnerWebPushFromPreferences(out, preferences, now);
}

/**
 * Web Push 발송 전 사용자 설정·방해금지·마케팅 동의를 적용한다.
 * Member: P2-A4 read authority → P2-A3 resolver → P2-A2 policy.
 * Owner: P2-A6 owner_notification_settings → P2-A3 resolver → P2-A2 policy.
 */
export async function shouldSendWebPushForUser(
  svc: SupabaseClient,
  userId: string,
  out: NotificationSideEffectPayloadOut
): Promise<boolean> {
  const recipientRole = resolveWebPushPreferenceRecipientRole(out);
  if (recipientRole === "owner") {
    return shouldSendOwnerWebPushForUser(svc, userId, out);
  }
  return shouldSendMemberWebPushForUser(svc, userId, out);
}
