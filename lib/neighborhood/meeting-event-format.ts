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

export const MEETING_EVENT_TYPE_LABELS: Record<MeetingEventTypeSlug, string> = {
  join_requested: "가입 신청",
  join_approved: "가입 승인",
  join_rejected: "가입 거절",
  member_joined: "참여",
  member_left: "나가기",
  member_kicked: "보내기",
  member_banned: "차단",
  member_unbanned: "차단 해제",
  member_attendance_updated: "참석 표시",
  notice_created: "공지 등록",
  notice_updated: "공지 수정",
  notice_deleted: "공지 삭제",
  meeting_closed: "모임 마감",
  meeting_reopened: "모임 재개",
  meeting_ended: "모임 종료",
  meeting_cancelled: "모임 취소",
};

export function isMeetingEventType(value: string): value is MeetingEventTypeSlug {
  return (MEETING_EVENT_TYPES as readonly string[]).includes(value);
}

function attendanceStatusLabel(code: string): string {
  if (code === "attending") return "참석";
  if (code === "absent") return "불참";
  if (code === "excused") return "불참(사유)";
  if (code === "unknown") return "미정";
  return code;
}

export function formatMeetingEventDescription(event: NeighborhoodMeetingEventDTO): string {
  const t = event.event_type;
  if (t === "join_requested") {
    return `${event.target_name ?? "사용자"} 님이 가입을 신청했습니다.`;
  }
  if (t === "join_approved") {
    return `${event.actor_name} 님이 ${event.target_name ?? "사용자"} 님의 가입을 승인했습니다.`;
  }
  if (t === "join_rejected") {
    return `${event.actor_name} 님이 ${event.target_name ?? "사용자"} 님의 가입을 거절했습니다.`;
  }
  if (t === "member_joined") {
    return `${event.target_name ?? "사용자"} 님이 모임에 참여했습니다.`;
  }
  if (t === "member_left") {
    return `${event.target_name ?? "사용자"} 님이 모임을 나갔습니다.`;
  }
  if (t === "member_kicked") {
    return `${event.actor_name} 님이 ${event.target_name ?? "사용자"} 님을 내보냈습니다.`;
  }
  if (t === "member_banned") {
    return `${event.actor_name} 님이 ${event.target_name ?? "사용자"} 님을 차단했습니다.`;
  }
  if (t === "member_unbanned") {
    return `${event.actor_name} 님이 ${event.target_name ?? "사용자"} 님의 차단을 해제했습니다.`;
  }
  if (t === "member_attendance_updated") {
    const p = event.payload ?? {};
    const fromS = typeof p.from_status === "string" ? p.from_status : "unknown";
    const toS = typeof p.to_status === "string" ? p.to_status : "unknown";
    return `${event.actor_name} 님이 ${event.target_name ?? "사용자"} 님의 참석을 「${attendanceStatusLabel(fromS)}」→「${attendanceStatusLabel(toS)}」로 바꿨습니다.`;
  }
  if (t === "notice_created") {
    return `${event.actor_name} 님이 공지를 등록했습니다.`;
  }
  if (t === "notice_updated") {
    return `${event.actor_name} 님이 공지를 수정했습니다.`;
  }
  if (t === "notice_deleted") {
    return `${event.actor_name} 님이 공지를 삭제했습니다.`;
  }
  if (t === "meeting_closed") {
    return `${event.actor_name} 님이 모임을 마감했습니다.`;
  }
  if (t === "meeting_reopened") {
    return `${event.actor_name} 님이 모임을 다시 열었습니다.`;
  }
  if (t === "meeting_ended") {
    return `${event.actor_name} 님이 모임을 종료했습니다.`;
  }
  if (t === "meeting_cancelled") {
    return `${event.actor_name} 님이 모임을 취소했습니다.`;
  }
  return `${event.actor_name} 님이 모임 상태를 변경했습니다.`;
}
