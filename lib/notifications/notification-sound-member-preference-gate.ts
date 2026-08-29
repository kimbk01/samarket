/**
 * P2-A5b — Member in-app sound preference decision (pure + row adapter).
 *
 * Consumes P2-A4-normalized preferences via P2-A3 resolver.
 * Owner sound: P2-A7b `notification-sound-owner-preference-gate`.
 */

import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import type { NotificationPreferenceRecipientRole } from "@/lib/notifications/policy/notification-preference-policy-types";
import {
  deriveWebPushKind,
  resolveWebPushPreferenceEventType,
  resolveWebPushPreferenceRecipientRole,
} from "@/lib/notifications/web-push-user-settings-gate";

function metaRecord(row: Record<string, unknown>): Record<string, unknown> | null {
  return row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
}

function metaKindFromRow(row: Record<string, unknown>): string | null {
  const meta = metaRecord(row);
  const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  return kind.length > 0 ? kind : null;
}

/** Adapt notification row → side-effect shape for shared policy lookup helpers. */
export function soundRowToSideEffectPayload(row: Record<string, unknown>): NotificationSideEffectPayloadOut {
  const meta = metaRecord(row);
  const notification_type = String(row.notification_type ?? row.type ?? "").trim();
  return {
    user_id: typeof row.user_id === "string" ? row.user_id : "",
    notification_type,
    title: typeof row.title === "string" ? row.title : "",
    body: typeof row.body === "string" ? row.body : null,
    link_url: null,
    link_url_absolute: null,
    occurred_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    meta,
  };
}

export function resolveSoundPreferenceRecipientRole(
  row: Record<string, unknown>
): NotificationPreferenceRecipientRole {
  return resolveWebPushPreferenceRecipientRole(soundRowToSideEffectPayload(row));
}

/** Pure member sound decision — P2-A3 `playSound` only. */
export function resolveMemberSoundFromPreferences(
  row: Record<string, unknown>,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  const out = soundRowToSideEffectPayload(row);
  return resolveEffectiveNotificationPreference({
    eventType: resolveWebPushPreferenceEventType(out),
    metaKind: metaKindFromRow(row),
    recipientRole: "member",
    pushKind: deriveWebPushKind(out),
    preferences,
    now,
  }).playSound;
}
