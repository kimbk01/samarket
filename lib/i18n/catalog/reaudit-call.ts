/**
 * 통화 문구 재감사(2026-11-27) — 통화 푸시·부재중 알림·발신 실패 안내·그룹 통화 상태.
 * 계획: docs/audit/i18n-call-copy-plan-2026-11-27.md
 */
export const reauditCallMessages = {
  ko: {
    reaudit_call_incoming_push_body: "{name}님의 전화",
    reaudit_call_too_many_requests: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    reaudit_call_missed_title: "부재중 전화",
    reaudit_call_missed_body_voice: "{name} · 부재중 음성 통화",
    reaudit_call_missed_body_video: "{name} · 부재중 영상 통화",
    reaudit_call_room_create_failed: "대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
    reaudit_call_room_missing: "방 정보가 없어 통화를 시작할 수 없습니다.",
    reaudit_call_group_not_supported: "그룹 통화는 아직 지원하지 않습니다.",
    reaudit_call_room_unavailable: "이 대화방에서는 지금 통화를 시작할 수 없습니다.",
    reaudit_call_room_info_unavailable:
      "이 대화방 정보를 확인하지 못해 통화를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    reaudit_call_room_maintenance: "이 대화방은 점검 중이라 통화를 시작할 수 없습니다.",
    reaudit_call_friend_required: "통화를 원하면 친구를 요청하세요.",
    reaudit_call_group_status_active: "그룹 통화 진행 중",
    reaudit_call_group_status_ringing: "그룹 통화 연결 중",
    reaudit_call_group_status_waiting: "그룹 통화 대기",
    reaudit_call_group_status_can_start: "그룹 통화 시작 가능",
    reaudit_call_group_status_not_allowed: "그룹 통화 시작 권한 없음",
  },
  en: {
    reaudit_call_incoming_push_body: "{name} is calling",
    reaudit_call_too_many_requests: "Too many requests. Please try again shortly.",
    reaudit_call_missed_title: "Missed call",
    reaudit_call_missed_body_voice: "{name} · Missed voice call",
    reaudit_call_missed_body_video: "{name} · Missed video call",
    reaudit_call_room_create_failed: "Couldn't open the chat. Please try again shortly.",
    reaudit_call_room_missing: "Can't start the call because the chat details are missing.",
    reaudit_call_group_not_supported: "Group calls aren't available yet.",
    reaudit_call_room_unavailable: "You can't start a call in this chat right now.",
    reaudit_call_room_info_unavailable: "Couldn't check this chat, so the call can't start. Please try again shortly.",
    reaudit_call_room_maintenance: "This chat is under maintenance, so you can't start a call.",
    reaudit_call_friend_required: "To call, send a friend request first.",
    reaudit_call_group_status_active: "Group call in progress",
    reaudit_call_group_status_ringing: "Group call connecting",
    reaudit_call_group_status_waiting: "Group call waiting",
    reaudit_call_group_status_can_start: "You can start a group call",
    reaudit_call_group_status_not_allowed: "You can't start group calls",
  },
} as const;
