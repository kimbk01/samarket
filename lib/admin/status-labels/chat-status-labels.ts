/**
 * 채팅 Admin 상태·유형 라벨 레지스트리 (R1 공통 기준 — 배달 `delivery-status-labels` 와 같은 규칙).
 * 원시 값은 운영 화면 1차 정보로 쓰지 않고, 미등록 값은 「알 수 없음」 + 기술 정보에서만 원시 값 표시.
 * Client-safe (DB·서버 모듈 import 없음).
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";

export type AdminChatLabel = { ko: string; en: string; tone: AdminTone };
type Registry = Record<string, AdminChatLabel>;

/** 방 상태 — CM `room_status` + 레거시 `chat_rooms` 파생값 (`RoomStatus`). */
const ROOM_STATUS: Registry = {
  active: { ko: "정상", en: "Active", tone: "success" },
  blocked: { ko: "정지됨", en: "Suspended", tone: "danger" },
  archived: { ko: "보관됨", en: "Archived", tone: "neutral" },
  readonly: { ko: "읽기 전용", en: "Read-only", tone: "warning" },
  deleted: { ko: "삭제됨", en: "Deleted", tone: "neutral" },
  closed: { ko: "종료됨", en: "Closed", tone: "neutral" },
};

/** 채팅 유형 — `community_messenger_rooms.chat_domain`. */
const CHAT_DOMAIN: Registry = {
  general_direct: { ko: "일반 1:1", en: "1:1 chat", tone: "neutral" },
  group: { ko: "그룹", en: "Group", tone: "neutral" },
  trade: { ko: "거래", en: "Trade", tone: "progress" },
  store_order: { ko: "배달 주문", en: "Delivery order", tone: "progress" },
};

/** CM `room_type`. */
const CM_ROOM_TYPE: Registry = {
  direct: { ko: "1:1", en: "1:1", tone: "neutral" },
  private_group: { ko: "비공개 그룹", en: "Private group", tone: "neutral" },
  open_group: { ko: "공개 그룹", en: "Open group", tone: "neutral" },
};

/** 신고 상태 — CM / 레거시 `chat_reports` / `reports` 공통. */
const REPORT_STATUS: Registry = {
  received: { ko: "접수", en: "Received", tone: "waiting" },
  pending: { ko: "접수", en: "Received", tone: "waiting" },
  open: { ko: "접수", en: "Received", tone: "waiting" },
  reviewing: { ko: "검토 중", en: "Reviewing", tone: "progress" },
  triaging: { ko: "분류 중", en: "Triaging", tone: "progress" },
  escalated: { ko: "상위 검토", en: "Escalated", tone: "warning" },
  resolved: { ko: "처리 완료", en: "Resolved", tone: "success" },
  reviewed: { ko: "처리 완료", en: "Resolved", tone: "success" },
  actioned: { ko: "조치 완료", en: "Actioned", tone: "success" },
  sanctioned: { ko: "제재 완료", en: "Sanctioned", tone: "success" },
  rejected: { ko: "기각", en: "Dismissed", tone: "neutral" },
  dismissed: { ko: "기각", en: "Dismissed", tone: "neutral" },
};

/** 신고 사유 — CM / chat_reports `reason_type` · reports `reason_code`. */
const REPORT_REASON: Registry = {
  abuse: { ko: "욕설·비방", en: "Abuse", tone: "danger" },
  spam: { ko: "스팸", en: "Spam", tone: "warning" },
  promo: { ko: "광고·홍보", en: "Promotion", tone: "warning" },
  scam: { ko: "사기", en: "Scam", tone: "danger" },
  fraud: { ko: "사기", en: "Fraud", tone: "danger" },
  sexual: { ko: "성적 콘텐츠", en: "Sexual content", tone: "danger" },
  hate: { ko: "혐오 표현", en: "Hate speech", tone: "danger" },
  threat: { ko: "위협", en: "Threat", tone: "danger" },
  no_show: { ko: "약속 불이행", en: "No-show", tone: "warning" },
  impersonation: { ko: "사칭", en: "Impersonation", tone: "danger" },
  off_platform_payment: { ko: "외부 결제 유도", en: "Off-platform payment", tone: "danger" },
  stalking: { ko: "스토킹", en: "Stalking", tone: "danger" },
  harassment: { ko: "괴롭힘", en: "Harassment", tone: "danger" },
  privacy: { ko: "개인정보 노출", en: "Privacy", tone: "danger" },
  inappropriate: { ko: "부적절한 내용", en: "Inappropriate", tone: "warning" },
  inappropriate_behavior: { ko: "부적절한 행위", en: "Inappropriate behavior", tone: "warning" },
  fake_listing: { ko: "허위 게시", en: "Fake listing", tone: "warning" },
  etc: { ko: "기타", en: "Other", tone: "neutral" },
  other: { ko: "기타", en: "Other", tone: "neutral" },
};

/** 신고 대상 — CM `report_type` · chat_reports `report_type` · reports `target_type`. */
const REPORT_TARGET: Registry = {
  room: { ko: "채팅방", en: "Room", tone: "neutral" },
  chat_room: { ko: "채팅방", en: "Room", tone: "neutral" },
  chat: { ko: "채팅방", en: "Room", tone: "neutral" },
  message: { ko: "메시지", en: "Message", tone: "neutral" },
  chat_message: { ko: "메시지", en: "Message", tone: "neutral" },
  user: { ko: "회원", en: "Member", tone: "neutral" },
};

/** 참여자 역할 — CM `role` · store_order_role · 거래 판매자/구매자. */
const PARTICIPANT_ROLE: Registry = {
  owner: { ko: "방장", en: "Owner", tone: "neutral" },
  admin: { ko: "관리자", en: "Admin", tone: "neutral" },
  member: { ko: "멤버", en: "Member", tone: "neutral" },
  seller: { ko: "판매자", en: "Seller", tone: "neutral" },
  buyer: { ko: "구매자", en: "Buyer", tone: "neutral" },
  customer: { ko: "주문 고객", en: "Customer", tone: "neutral" },
  store_owner: { ko: "사장님", en: "Store owner", tone: "neutral" },
};

/** 메시지 유형 — CM `message_type` · 레거시 `messageType`. */
const MESSAGE_TYPE: Registry = {
  text: { ko: "텍스트", en: "Text", tone: "neutral" },
  image: { ko: "사진", en: "Image", tone: "neutral" },
  file: { ko: "파일", en: "File", tone: "neutral" },
  voice: { ko: "음성 메시지", en: "Voice", tone: "neutral" },
  system: { ko: "시스템 안내", en: "System", tone: "neutral" },
  call_stub: { ko: "통화 기록", en: "Call record", tone: "neutral" },
  sticker: { ko: "스티커", en: "Sticker", tone: "neutral" },
  price_offer: { ko: "가격 제안", en: "Price offer", tone: "neutral" },
  notice: { ko: "공지", en: "Notice", tone: "neutral" },
};

/** 통화 기록 상태 — `community_messenger_call_logs.status` · 세션 상태. */
const CALL_STATUS: Registry = {
  missed: { ko: "부재중", en: "Missed", tone: "warning" },
  rejected: { ko: "거절", en: "Declined", tone: "neutral" },
  cancelled: { ko: "취소", en: "Cancelled", tone: "neutral" },
  ended: { ko: "정상 종료", en: "Ended", tone: "success" },
  incoming: { ko: "수신 중", en: "Incoming", tone: "progress" },
  dialing: { ko: "발신 중", en: "Dialing", tone: "progress" },
  ringing: { ko: "연결 중", en: "Ringing", tone: "progress" },
  active: { ko: "통화 중", en: "In call", tone: "progress" },
};

/** 통화 종류. */
const CALL_KIND: Registry = {
  voice: { ko: "음성", en: "Voice", tone: "neutral" },
  video: { ko: "영상", en: "Video", tone: "neutral" },
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
  return { label: ko ? "알 수 없음" : "Unknown", tone: "neutral", known: false };
}

/** 필터 옵션 생성용 — 등록된 코드 목록 (중복 라벨 제거는 호출 측 책임). */
export function adminChatLabelCodes(domain: AdminChatLabelDomain): string[] {
  return Object.keys(REGISTRIES[domain]);
}
