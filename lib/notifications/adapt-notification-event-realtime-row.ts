import {
  mapNotificationEventToInboxRow,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";

/** Realtime `notification_events` INSERT → legacy notifications row shape for sound/popup gates */
export function adaptNotificationEventInsertToLegacyRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  const mapped = mapNotificationEventToInboxRow(row as NotificationEventInboxSource);
  return {
    id: mapped.id,
    user_id: row.user_id,
    created_at: mapped.created_at,
    notification_type: mapped.notification_type,
    push_kind: mapped.push_kind ?? null,
    meta: mapped.meta ?? null,
    link_url: mapped.link_url,
    ref_id: mapped.ref_id ?? null,
    domain: mapped.domain ?? null,
    muted_snapshot: row.muted_snapshot ?? null,
    sound_suppressed_reason: row.sound_suppressed_reason ?? null,
    type: row.type ?? mapped.event_type ?? null,
    event_type: mapped.event_type ?? null,
    message_id: row.message_id ?? null,
    dedupe_key: row.dedupe_key ?? mapped.dedupe_key ?? null,
    call_session_id: row.call_session_id ?? null,
    room_id: row.room_id ?? mapped.ref_id ?? null,
  };
}
