import {
  mapNotificationEventToInboxRow,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";

function previewKindOf(displayPayload: unknown): string | null {
  if (!displayPayload || typeof displayPayload !== "object") return null;
  const v = (displayPayload as Record<string, unknown>).previewKind;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Realtime `notification_events` INSERT → legacy notifications row shape for sound/popup gates */
export function adaptNotificationEventInsertToLegacyRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  const mapped = mapNotificationEventToInboxRow(row as NotificationEventInboxSource);
  return {
    id: mapped.id,
    /** 앱 안 배너 — notification_events 행 표시 (legacy `notifications` 행과 구분) */
    source: "event",
    title: mapped.title ?? null,
    bell_presentation_type: mapped.bell_presentation_type ?? null,
    campaign_type: mapped.campaign_type ?? null,
    event_kind: mapped.event_kind ?? null,
    /** 알림 항목 SSOT — 소리 항목 판정(사장님 플랫폼 문의 답변 등 previewKind 로만 구분되는 항목). */
    preview_kind: previewKindOf(row.display_payload),
    user_id: row.user_id,
    created_at: mapped.created_at,
    notification_type: mapped.notification_type,
    push_kind: mapped.push_kind ?? null,
    meta: mapped.meta ?? null,
    link_url: mapped.link_url,
    // Support D1 in-app notice preview (admin reply text). Not used by sound/popup gates.
    body: mapped.body ?? null,
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
