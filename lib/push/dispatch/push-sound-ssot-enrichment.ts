/**
 * Phase 2-1 (F3): Push dispatch SSOT sound meta enrichment.
 * Fills event_key / sound_asset_id / android_channel_id / ios_sound_name when absent.
 * Phase 1 resolver/registry — read-only.
 */
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import {
  eventKeyForCallKind,
  eventKeyForNotificationDomain,
  eventKeyForNotificationEventType,
} from "@/lib/notifications/notification-sound-event-map";
import { isNotificationDomain } from "@/lib/notifications/notification-domains";
import { resolveNotificationSoundForEvent } from "@/lib/notifications/notification-sound-resolver";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { resolveEventType, type DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metaRecord(out: NotificationSideEffectPayloadOut): Record<string, unknown> | null {
  return out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
}

function hasSsotSoundMeta(meta: Record<string, unknown> | null): boolean {
  return Boolean(trimText(meta?.event_key ?? meta?.eventKey));
}

function isNotificationEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

function resolveCallKindFromMeta(meta: Record<string, unknown> | null): "voice" | "video" {
  const raw =
    trimText(meta?.kind) ||
    trimText(meta?.call_kind) ||
    trimText(meta?.callKind) ||
    trimText(meta?.media_type);
  return raw === "video" ? "video" : "voice";
}

function eventKeyFromPushKind(pushKind: string): string | null {
  switch (pushKind) {
    case "marketing":
      return eventKeyForNotificationEventType("admin_marketing_banner");
    case "notice":
    case "system":
      return eventKeyForNotificationEventType("admin_notice");
    case "delivery":
      return eventKeyForNotificationEventType("order_status");
    case "trade":
      return eventKeyForNotificationEventType("trade_status");
    case "community":
      return eventKeyForNotificationEventType("community_activity");
    case "chat":
      return eventKeyForNotificationEventType("chat_message");
    default:
      return null;
  }
}

function eventKeyFromMetaKind(metaKind: string): string | null {
  if (isNotificationEventType(metaKind)) {
    return eventKeyForNotificationEventType(metaKind);
  }
  switch (metaKind) {
    case "group_chat":
    case "community_group_invite":
      return eventKeyForNotificationEventType("group_message");
    case "trade_chat":
      return eventKeyForNotificationEventType("trade_message");
    case "community_chat":
      return eventKeyForNotificationEventType("chat_message");
    default:
      return null;
  }
}

/**
 * Derives SSOT eventKey for push dispatch when meta.event_key is missing.
 */
export function resolveEventKeyForPushDispatch(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): string {
  const explicit = trimText(opts?.event_key);
  if (explicit) return explicit;

  const meta = metaRecord(out);
  if (hasSsotSoundMeta(meta)) {
    return trimText(meta?.event_key ?? meta?.eventKey);
  }

  const eventType = resolveEventType(out, opts);

  if (eventType === "call_ringing" || opts?.call_push_kind === "incoming_call") {
    return eventKeyForCallKind(resolveCallKindFromMeta(meta), "incoming");
  }
  if (eventType === "missed_call" || opts?.call_push_kind === "missed_call") {
    return eventKeyForNotificationEventType("missed_call");
  }
  if (opts?.call_push_kind === "call_rejected") {
    return "call_rejected";
  }
  if (opts?.call_push_kind === "call_canceled" || opts?.call_push_kind === "call_ended") {
    return "call_ended";
  }

  if (isNotificationEventType(eventType)) {
    return eventKeyForNotificationEventType(eventType);
  }

  if (meta) {
    const fromKind = eventKeyFromMetaKind(trimText(meta.kind));
    if (fromKind) return fromKind;

    const category = trimText(meta.category);
    if (category && isNotificationEventType(category)) {
      return eventKeyForNotificationEventType(category);
    }

    const pushKind = trimText(meta.push_kind);
    const fromPushKind = eventKeyFromPushKind(pushKind);
    if (fromPushKind) return fromPushKind;

    const domain = trimText(meta.domain);
    if (domain && isNotificationDomain(domain)) {
      return eventKeyForNotificationDomain(domain);
    }
  }

  const nt = trimText(out.notification_type);
  if (nt === "marketing") return eventKeyForNotificationEventType("admin_marketing_banner");
  if (nt === "notice" || nt === "system") return eventKeyForNotificationEventType("admin_notice");
  if (nt === "community_messenger_missed_call") return eventKeyForNotificationEventType("missed_call");
  if (nt === "community_messenger_incoming_call") {
    return eventKeyForCallKind(resolveCallKindFromMeta(meta), "incoming");
  }
  if (nt === "admin_test") return eventKeyForNotificationEventType("admin_notice");

  return "system_default";
}

/** Returns a shallow copy with SSOT sound meta merged into meta when missing. */
export function enrichPushPayloadWithSoundSsotMeta(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): NotificationSideEffectPayloadOut {
  const meta = metaRecord(out);
  if (hasSsotSoundMeta(meta)) {
    return out;
  }

  const eventKey = resolveEventKeyForPushDispatch(out, opts);
  const soundResolved = resolveNotificationSoundForEvent(eventKey, { platform: "android" });

  const nextMeta: Record<string, unknown> = {
    ...(meta ?? {}),
    event_key: eventKey,
    sound_asset_id: soundResolved.assetId,
    android_channel_id: soundResolved.androidChannelId,
    ios_sound_name: soundResolved.iosSoundName,
  };

  return {
    ...out,
    meta: nextMeta,
  };
}
