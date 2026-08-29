/**
 * P2-A7b — Owner in-app sound preference decision (pure).
 *
 * Consumes P2-A6 owner snapshot via P2-A3 resolver.
 * Does not read Member sound/order/store toggles.
 */

import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  deriveWebPushKind,
  resolveWebPushPreferenceEventType,
} from "@/lib/notifications/web-push-user-settings-gate";
import {
  resolveSoundPreferenceRecipientRole,
  soundRowToSideEffectPayload,
} from "@/lib/notifications/notification-sound-member-preference-gate";

function metaKindFromRow(row: Record<string, unknown>): string | null {
  const meta =
    row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
  const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  return kind.length > 0 ? kind : null;
}

/** Pure Owner sound decision — P2-A3 `playSound` only; explicit recipientRole=owner. */
export function resolveOwnerSoundFromPreferences(
  row: Record<string, unknown>,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  const out = soundRowToSideEffectPayload(row);
  return resolveEffectiveNotificationPreference({
    eventType: resolveWebPushPreferenceEventType(out),
    metaKind: metaKindFromRow(row),
    recipientRole: "owner",
    pushKind: deriveWebPushKind(out),
    preferences,
    now,
  }).playSound;
}

export { resolveSoundPreferenceRecipientRole };
