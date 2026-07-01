/**
 * Admin-only repeat ring policy (UI + PATCH validation).
 * Do not import from runtime resolver / Native playback paths.
 */
import { NOTIFICATION_SOUND_EVENT_KEYS } from "@/lib/notifications/notification-sound-registry";

export type NotificationSoundRepeatPolicy = "once" | "repeat";

/** Events that may use repeat_count 2–5 in admin SSOT. */
export const REPEAT_RING_EVENT_KEYS = [
  "call_incoming_voice",
  "call_incoming_video",
  "delivery_order_created_owner",
  "delivery_order_cancelled_owner",
  "delivery_order_delayed_owner",
  "delivery_order_sold_out_owner",
  "admin_report_received",
  "settlement_charge_requested",
] as const;

export type RepeatRingEventKey = (typeof REPEAT_RING_EVENT_KEYS)[number];

const REPEAT_RING_SET = new Set<string>(REPEAT_RING_EVENT_KEYS);

export function getRepeatPolicy(eventKey: string): NotificationSoundRepeatPolicy {
  return REPEAT_RING_SET.has(eventKey) ? "repeat" : "once";
}

export function isRepeatRingEvent(eventKey: string): boolean {
  return REPEAT_RING_SET.has(eventKey);
}

export type RepeatCountValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: "repeat_not_allowed_for_once_event" | "invalid repeat_count";
      field: "repeat_count";
      event_key: string;
    };

export function validateRepeatCountForEvent(
  eventKey: string,
  repeatCount: number
): RepeatCountValidationResult {
  if (!Number.isFinite(repeatCount) || repeatCount < 1 || repeatCount > 5) {
    return {
      ok: false,
      error: "invalid repeat_count",
      field: "repeat_count",
      event_key: eventKey,
    };
  }
  if (!isRepeatRingEvent(eventKey) && repeatCount > 1) {
    return {
      ok: false,
      error: "repeat_not_allowed_for_once_event",
      field: "repeat_count",
      event_key: eventKey,
    };
  }
  return { ok: true };
}

/** Ensures REPEAT_RING_EVENT_KEYS only contains registered registry keys. */
export function assertRepeatPolicyRegistryIntegrity(): void {
  for (const key of REPEAT_RING_EVENT_KEYS) {
    if (!NOTIFICATION_SOUND_EVENT_KEYS.includes(key)) {
      throw new Error(`repeat policy references unknown event_key: ${key}`);
    }
  }
}
