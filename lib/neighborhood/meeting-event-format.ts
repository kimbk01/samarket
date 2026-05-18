import type { MessageKey } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type { NeighborhoodMeetingEventDTO } from "@/lib/neighborhood/types";

/** DB `meeting_events.event_type` CHECK 목록과 동기화 */
export const MEETING_EVENT_TYPES = [
  "join_requested",
  "join_approved",
  "join_rejected",
  "member_joined",
  "member_left",
  "member_kicked",
  "member_banned",
  "member_unbanned",
  "member_attendance_updated",
  "notice_created",
  "notice_updated",
  "notice_deleted",
  "meeting_closed",
  "meeting_reopened",
  "meeting_ended",
  "meeting_cancelled",
] as const;

export type MeetingEventTypeSlug = (typeof MEETING_EVENT_TYPES)[number];

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const MEETING_EVENT_TYPE_LABEL_KEYS: Record<MeetingEventTypeSlug, MessageKey> = {
  join_requested: "meeting_evt_type_join_requested",
  join_approved: "meeting_evt_type_join_approved",
  join_rejected: "meeting_evt_type_join_rejected",
  member_joined: "meeting_evt_type_member_joined",
  member_left: "meeting_evt_type_member_left",
  member_kicked: "meeting_evt_type_member_kicked",
  member_banned: "meeting_evt_type_member_banned",
  member_unbanned: "meeting_evt_type_member_unbanned",
  member_attendance_updated: "meeting_evt_type_member_attendance_updated",
  notice_created: "meeting_evt_type_notice_created",
  notice_updated: "meeting_evt_type_notice_updated",
  notice_deleted: "meeting_evt_type_notice_deleted",
  meeting_closed: "meeting_evt_type_meeting_closed",
  meeting_reopened: "meeting_evt_type_meeting_reopened",
  meeting_ended: "meeting_evt_type_meeting_ended",
  meeting_cancelled: "meeting_evt_type_meeting_cancelled",
};

export function isMeetingEventType(value: string): value is MeetingEventTypeSlug {
  return (MEETING_EVENT_TYPES as readonly string[]).includes(value);
}

export function meetingEventTypeLabel(
  t: TranslateFn,
  type: MeetingEventTypeSlug
): string {
  return t(MEETING_EVENT_TYPE_LABEL_KEYS[type]);
}

function defaultT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}

function userFallback(t: TranslateFn, name: string | null | undefined): string {
  return (name?.trim() || t("meeting_evt_user_fallback")) ?? "";
}

function attendanceStatusLabel(t: TranslateFn, code: string): string {
  if (code === "attending") return t("meeting_evt_attendance_attending");
  if (code === "absent") return t("meeting_evt_attendance_absent");
  if (code === "excused") return t("meeting_evt_attendance_excused");
  if (code === "unknown") return t("meeting_evt_attendance_unknown");
  return code;
}

export function formatMeetingEventDescription(
  event: NeighborhoodMeetingEventDTO,
  t: TranslateFn = defaultT
): string {
  const target = userFallback(t, event.target_name);
  const actor = userFallback(t, event.actor_name);
  const ev = event.event_type;
  if (ev === "join_requested") {
    return t("meeting_evt_desc_join_requested", { name: target });
  }
  if (ev === "join_approved") {
    return t("meeting_evt_desc_join_approved", { actor, target });
  }
  if (ev === "join_rejected") {
    return t("meeting_evt_desc_join_rejected", { actor, target });
  }
  if (ev === "member_joined") {
    return t("meeting_evt_desc_member_joined", { name: target });
  }
  if (ev === "member_left") {
    return t("meeting_evt_desc_member_left", { name: target });
  }
  if (ev === "member_kicked") {
    return t("meeting_evt_desc_member_kicked", { actor, target });
  }
  if (ev === "member_banned") {
    return t("meeting_evt_desc_member_banned", { actor, target });
  }
  if (ev === "member_unbanned") {
    return t("meeting_evt_desc_member_unbanned", { actor, target });
  }
  if (ev === "member_attendance_updated") {
    const p = event.payload ?? {};
    const fromS = typeof p.from_status === "string" ? p.from_status : "unknown";
    const toS = typeof p.to_status === "string" ? p.to_status : "unknown";
    return t("meeting_evt_desc_attendance_updated", {
      actor,
      target,
      from: attendanceStatusLabel(t, fromS),
      to: attendanceStatusLabel(t, toS),
    });
  }
  if (ev === "notice_created") {
    return t("meeting_evt_desc_notice_created", { actor });
  }
  if (ev === "notice_updated") {
    return t("meeting_evt_desc_notice_updated", { actor });
  }
  if (ev === "notice_deleted") {
    return t("meeting_evt_desc_notice_deleted", { actor });
  }
  if (ev === "meeting_closed") {
    return t("meeting_evt_desc_meeting_closed", { actor });
  }
  if (ev === "meeting_reopened") {
    return t("meeting_evt_desc_meeting_reopened", { actor });
  }
  if (ev === "meeting_ended") {
    return t("meeting_evt_desc_meeting_ended", { actor });
  }
  if (ev === "meeting_cancelled") {
    return t("meeting_evt_desc_meeting_cancelled", { actor });
  }
  return t("meeting_evt_desc_fallback", { actor });
}
