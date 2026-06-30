/**
 * Phase 2-1 (F3): Push dispatch SSOT sound meta enrichment.
 * Fills event_key / sound_asset_id / android_channel_id / ios_sound_name when absent.
 * Requires server DB hydrate before resolve (see dispatch-push-for-user / notify-push-dispatcher).
 */
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import {
  eventKeyForCallKind,
  eventKeyForNotificationDomain,
  eventKeyForNotificationEventType,
} from "@/lib/notifications/notification-sound-event-map";
import {
  resolveNotificationSoundEventKeyFromRow,
  resolveNotificationSoundEventKeyFromRowWithFallback,
  type NotificationSoundRowInput,
} from "@/lib/notifications/notification-sound-event-key-from-row";
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

function isIncomingCallPush(out: NotificationSideEffectPayloadOut, opts?: DispatchPushOptions): boolean {
  return opts?.call_push_kind === "incoming_call" || out.notification_type === "community_messenger_incoming_call";
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

export function rowInputFromPushOut(out: NotificationSideEffectPayloadOut): NotificationSoundRowInput {
  const meta = metaRecord(out);
  return {
    notification_type: out.notification_type,
    domain: trimText(meta?.domain) || null,
    meta,
    ref_id: trimText(meta?.ref_id ?? meta?.order_id ?? meta?.room_id) || null,
  };
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

  const fromRow = resolveNotificationSoundEventKeyFromRow(rowInputFromPushOut(out));
  if (fromRow) return fromRow;

  if (isNotificationEventType(eventType)) {
    return eventKeyForNotificationEventType(eventType);
  }

  if (meta) {
    const category = trimText(meta.category);
    if (category && isNotificationEventType(category)) {
      return eventKeyForNotificationEventType(category);
    }

    const domain = trimText(meta.domain);
    if (domain && isNotificationDomain(domain)) {
      return eventKeyForNotificationDomain(domain);
    }
  }

  return resolveNotificationSoundEventKeyFromRowWithFallback(rowInputFromPushOut(out));
}

/** Returns a shallow copy with SSOT sound meta merged into meta when missing. */
export function enrichPushPayloadWithSoundSsotMeta(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): NotificationSideEffectPayloadOut {
  const meta = metaRecord(out);
  if (hasSsotSoundMeta(meta) && !isIncomingCallPush(out, opts)) {
    return out;
  }

  const eventKey = resolveEventKeyForPushDispatch(out, opts);
  const soundResolved = resolveNotificationSoundForEvent(eventKey, { platform: "android" });
  const ringtoneUrl = trimText(soundResolved.webUrl);

  const nextMeta: Record<string, unknown> = {
    ...(meta ?? {}),
    event_key: eventKey,
    sound_asset_id: trimText(meta?.sound_asset_id ?? meta?.soundAssetId) || soundResolved.assetId,
    android_channel_id:
      trimText(meta?.android_channel_id ?? meta?.androidChannelId) || soundResolved.androidChannelId,
    ios_sound_name: trimText(meta?.ios_sound_name ?? meta?.iosSoundName) || soundResolved.iosSoundName,
  };
  const existingRingtoneUrl = trimText(meta?.ringtone_url ?? meta?.ringtoneUrl);
  if (existingRingtoneUrl || ringtoneUrl) {
    nextMeta.ringtone_url = existingRingtoneUrl || ringtoneUrl;
  }

  return {
    ...out,
    meta: nextMeta,
  };
}
