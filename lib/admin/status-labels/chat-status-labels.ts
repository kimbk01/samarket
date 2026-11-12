/**
 * 채팅 Admin 상태·유형 라벨 레지스트리 (R1 공통 기준 — 배달 `delivery-status-labels` 와 같은 규칙).
 * 원시 값은 운영 화면 1차 정보로 쓰지 않고, 미등록 값은 「알 수 없음」 + 기술 정보에서만 원시 값 표시.
 * Client-safe (DB·서버 모듈 import 없음).
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type AdminChatLabel = { ko: string; en: string; tone: AdminTone };
type Registry = Record<string, AdminChatLabel>;

/** 방 상태 — CM `room_status` + 레거시 `chat_rooms` 파생값 (`RoomStatus`). */
const ROOM_STATUS: Registry = {
  active: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  blocked: { ...catalogPair("admin_suspended_2"), tone: "danger" },
  archived: { ...catalogPair("admin_chat_r1b_status_archived"), tone: "neutral" },
  readonly: { ...catalogPair("admin_chat_r1b_readonly"), tone: "warning" },
  deleted: { ...catalogPair("admin_ads_history_filter_deleted"), tone: "neutral" },
  closed: { ...catalogPair("admin_closed"), tone: "neutral" },
};

/** 채팅 유형 — `community_messenger_rooms.chat_domain`. */
const CHAT_DOMAIN: Registry = {
  general_direct: { ...catalogPair("admin_text_7"), tone: "neutral" },
  group: { ...catalogPair("admin_cm_session_mode_group"), tone: "neutral" },
  trade: { ...catalogPair("admin_domain_chip_market"), tone: "progress" },
  store_order: { ...catalogPair("admin_delivery_order"), tone: "progress" },
};

/** CM `room_type`. */
const CM_ROOM_TYPE: Registry = {
  direct: { ...catalogPair("admin_text_8"), tone: "neutral" },
  private_group: { ...catalogPair("admin_cm_room_type_private_group"), tone: "neutral" },
  open_group: { ...catalogPair("admin_cm_room_type_open_group"), tone: "neutral" },
};

/** 신고 상태 — CM / 레거시 `chat_reports` / `reports` 공통. */
const REPORT_STATUS: Registry = {
  received: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  pending: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  open: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  reviewing: { ...catalogPair("admin_chat_reports_status_reviewing"), tone: "progress" },
  triaging: { ...catalogPair("admin_triaging"), tone: "progress" },
  escalated: { ...catalogPair("admin_escalated_2"), tone: "warning" },
  resolved: { ...catalogPair("admin_chat_reports_status_resolved"), tone: "success" },
  reviewed: { ...catalogPair("admin_chat_reports_status_resolved"), tone: "success" },
  actioned: { ...catalogPair("admin_stores_reports_actioned"), tone: "success" },
  sanctioned: { ...catalogPair("admin_sanctioned"), tone: "success" },
  rejected: { ...catalogPair("admin_chat_reports_status_dismissed"), tone: "neutral" },
  dismissed: { ...catalogPair("admin_chat_reports_status_dismissed"), tone: "neutral" },
};

/** 신고 사유 — CM / chat_reports `reason_type` · reports `reason_code`. */
const REPORT_REASON: Registry = {
  abuse: { ...catalogPair("admin_abuse"), tone: "danger" },
  spam: { ...catalogPair("admin_report_reason_spam"), tone: "warning" },
  promo: { ...catalogPair("admin_promotion"), tone: "warning" },
  scam: { ...catalogPair("admin_scam"), tone: "danger" },
  fraud: { ...catalogPair("admin_report_reason_fraud"), tone: "danger" },
  sexual: { ...catalogPair("admin_sexual_content"), tone: "danger" },
  hate: { ...catalogPair("admin_hate_speech"), tone: "danger" },
  threat: { ...catalogPair("admin_threat"), tone: "danger" },
  no_show: { ...catalogPair("admin_no_show"), tone: "warning" },
  impersonation: { ...catalogPair("admin_meeting_reports_reason_impersonation"), tone: "danger" },
  off_platform_payment: { ...catalogPair("admin_off_platform_payment"), tone: "danger" },
  stalking: { ...catalogPair("admin_stalking"), tone: "danger" },
  harassment: { ...catalogPair("admin_harassment_2"), tone: "danger" },
  privacy: { ...catalogPair("admin_privacy"), tone: "danger" },
  inappropriate: { ...catalogPair("admin_inappropriate"), tone: "warning" },
  inappropriate_behavior: { ...catalogPair("admin_inappropriate_behavior"), tone: "warning" },
  fake_listing: { ...catalogPair("admin_report_reason_fake_listing"), tone: "warning" },
  etc: { ...catalogPair("admin_menu_bottom_icon_cat_misc"), tone: "neutral" },
  other: { ...catalogPair("admin_menu_bottom_icon_cat_misc"), tone: "neutral" },
};

/** 신고 대상 — CM `report_type` · chat_reports `report_type` · reports `target_type`. */
const REPORT_TARGET: Registry = {
  room: { ...catalogPair("admin_chat_calls_col_room"), tone: "neutral" },
  chat_room: { ...catalogPair("admin_chat_calls_col_room"), tone: "neutral" },
  chat: { ...catalogPair("admin_chat_calls_col_room"), tone: "neutral" },
  message: { ...catalogPair("admin_chat_sheet_message"), tone: "neutral" },
  chat_message: { ...catalogPair("admin_chat_sheet_message"), tone: "neutral" },
  user: { ...catalogPair("admin_users_role_badge_member"), tone: "neutral" },
};

/** 참여자 역할 — CM `role` · store_order_role · 거래 판매자/구매자. */
const PARTICIPANT_ROLE: Registry = {
  owner: { ...catalogPair("admin_cm_label_owner"), tone: "neutral" },
  admin: { ...catalogPair("admin_admin"), tone: "neutral" },
  member: { ...catalogPair("admin_meeting_reports_target_member"), tone: "neutral" },
  seller: { ...catalogPair("admin_posts_mgmt_th_seller"), tone: "neutral" },
  buyer: { ...catalogPair("admin_r4b_chat_role_buyer"), tone: "neutral" },
  customer: { ...catalogPair("admin_customer"), tone: "neutral" },
  store_owner: { ...catalogPair("admin_store_owner"), tone: "neutral" },
};

/** 메시지 유형 — CM `message_type` · 레거시 `messageType`. */
const MESSAGE_TYPE: Registry = {
  text: { ...catalogPair("admin_text_9"), tone: "neutral" },
  image: { ...catalogPair("admin_image"), tone: "neutral" },
  file: { ...catalogPair("admin_chat_r1b_kind_file"), tone: "neutral" },
  voice: { ...catalogPair("admin_voice"), tone: "neutral" },
  system: { ...catalogPair("admin_system_2"), tone: "neutral" },
  call_stub: { ...catalogPair("admin_chat_r1b_kind_call_stub"), tone: "neutral" },
  sticker: { ...catalogPair("admin_sticker"), tone: "neutral" },
  price_offer: { ...catalogPair("admin_price_offer"), tone: "neutral" },
  notice: { ...catalogPair("admin_notif_type_notice"), tone: "neutral" },
};

/** 통화 기록 상태 — `community_messenger_call_logs.status` · 세션 상태. */
const CALL_STATUS: Registry = {
  missed: { ...catalogPair("admin_missed"), tone: "warning" },
  rejected: { ...catalogPair("admin_declined"), tone: "neutral" },
  cancelled: { ...catalogPair("admin_cancelled_3"), tone: "neutral" },
  ended: { ...catalogPair("admin_ended_2"), tone: "success" },
  incoming: { ...catalogPair("admin_incoming"), tone: "progress" },
  dialing: { ...catalogPair("admin_dialing"), tone: "progress" },
  ringing: { ...catalogPair("admin_ringing"), tone: "progress" },
  active: { ...catalogPair("admin_in_call"), tone: "progress" },
};

/** 통화 종료 사유 — `community_messenger_call_sessions.ended_reason` 의 `:` 앞 코드 (운영 DB 실제 값 기준). */
const CALL_ENDED_REASON: Registry = {
  ended: { ...catalogPair("admin_ended_2"), tone: "neutral" },
  ended_by_caller: { ...catalogPair("admin_ended_by_caller"), tone: "neutral" },
  ended_by_callee: { ...catalogPair("admin_ended_by_callee"), tone: "neutral" },
  canceled: { ...catalogPair("admin_cancelled_5"), tone: "neutral" },
  cancelled: { ...catalogPair("admin_cancelled_5"), tone: "neutral" },
  missed: { ...catalogPair("admin_no_answer"), tone: "warning" },
  missed_timeout: { ...catalogPair("admin_no_answer"), tone: "warning" },
  declined: { ...catalogPair("admin_declined"), tone: "neutral" },
  rejected: { ...catalogPair("admin_declined"), tone: "neutral" },
  stale_ringing_expired: { ...catalogPair("admin_ringing_expired"), tone: "warning" },
  heartbeat_timeout: { ...catalogPair("admin_connection_lost"), tone: "danger" },
  failed_signaling: { ...catalogPair("admin_failed_signaling"), tone: "danger" },
  failed_network: { ...catalogPair("admin_failed_network"), tone: "danger" },
  failed_media: { ...catalogPair("admin_failed_media"), tone: "danger" },
  failed_ice: { ...catalogPair("admin_failed_ice"), tone: "danger" },
  failed_permission: { ...catalogPair("admin_failed_permission"), tone: "danger" },
  admin_force_end: { ...catalogPair("admin_ended_by_admin"), tone: "warning" },
  redial_replaced: { ...catalogPair("admin_replaced_by_redial"), tone: "neutral" },
  incoming_policy_superseded: { ...catalogPair("admin_superseded"), tone: "neutral" },
  qa_cleanup: { ...catalogPair("admin_qa_cleanup"), tone: "neutral" },
  cold_start_qa_cleanup: { ...catalogPair("admin_qa_cleanup"), tone: "neutral" },
  qa_owner_assist_end: { ...catalogPair("admin_qa_cleanup"), tone: "neutral" },
  boundary_a_server_path_preclear: { ...catalogPair("admin_qa_cleanup"), tone: "neutral" },
};

/** 통화 종류. */
const CALL_KIND: Registry = {
  voice: { ...catalogPair("admin_voice_2"), tone: "neutral" },
  video: { ...catalogPair("admin_video"), tone: "neutral" },
};

const REGISTRIES = {
  room_status: ROOM_STATUS,
  chat_domain: CHAT_DOMAIN,
  cm_room_type: CM_ROOM_TYPE,
  report_status: REPORT_STATUS,
  report_reason: REPORT_REASON,
  report_target: REPORT_TARGET,
  participant_role: PARTICIPANT_ROLE,
  message_type: MESSAGE_TYPE,
  call_status: CALL_STATUS,
  call_kind: CALL_KIND,
  call_ended_reason: CALL_ENDED_REASON,
} as const;

export type AdminChatLabelDomain = keyof typeof REGISTRIES;

export function adminChatLabel(
  domain: AdminChatLabelDomain,
  raw: string | null | undefined,
  ko: boolean
): { label: string; tone: AdminTone; known: boolean } {
  const key = String(raw ?? "").trim().toLowerCase();
  const hit = REGISTRIES[domain][key];
  if (hit) return { label: ko ? hit.ko : hit.en, tone: hit.tone, known: true };
  if (!key) return { label: "—", tone: "neutral", known: false };
  return { label: tx(ko, "admin_status_labels_unknown"), tone: "neutral", known: false };
}

/** 필터 옵션 생성용 — 등록된 코드 목록 (중복 라벨 제거는 호출 측 책임). */
export function adminChatLabelCodes(domain: AdminChatLabelDomain): string[] {
  return Object.keys(REGISTRIES[domain]);
}
