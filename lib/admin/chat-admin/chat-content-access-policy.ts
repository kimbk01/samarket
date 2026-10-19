/**
 * 채팅 Admin R1-A — 메시지 본문 열람·조치 정책 (순수 함수, 서버·클라이언트 공용).
 * 설계: docs/admin/dibay-admin-chat-audit-design.md §3.2·§3.3 (C-2·C-3·C-5).
 *
 * - 본문 열람은 권한 `chats` 가 기본. 신고·거래·주문에 연결된 방은 `chats` 로 열람(사유 선택, 연결 근거 기록).
 * - 연결 근거가 없는 사적 방(1:1·그룹)은 고스트 열람 — super_admin + 사유 10자 이상.
 * - 조치(숨김·차단·읽기전용·보관)는 사유 2자 이상 + 상태 조건 갱신(409) + audit_logs.
 * - 하드 삭제는 super_admin + 확인 문구 재입력 + 사유, 신고·조치 증거는 삭제하지 않는다.
 *
 * 이 파일은 서버 전용 모듈을 import 하지 않는다 (클라이언트 화면이 상수·판정을 공유).
 */

export const CHAT_ADMIN_GHOST_REASON_MIN_LENGTH = 10;
export const CHAT_ADMIN_ACTION_REASON_MIN_LENGTH = 2;
export const CHAT_ADMIN_REASON_MAX_LENGTH = 500;

/** 열람 사유 전달 — 쿼리 `reason` 또는 헤더 `x-admin-reason` (encodeURIComponent). */
export const CHAT_ADMIN_REASON_QUERY_PARAM = "reason";
export const CHAT_ADMIN_REASON_HEADER = "x-admin-reason";

/** 하드 삭제 L3 확인 문구 (화면 재입력 = 서버 검증). */
export const CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT = "DELETE";
export const CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH = CHAT_ADMIN_GHOST_REASON_MIN_LENGTH;

/** 감사 액션 이름 */
export const CHAT_ADMIN_AUDIT_CONTENT_VIEW = "chat_room.content_view";
export const CHAT_ADMIN_AUDIT_HARD_DELETE = "chat_room.hard_delete";
export const CHAT_ADMIN_AUDIT_MESSAGE_HIDE = "chat_message.hide";
export const CHAT_ADMIN_AUDIT_MESSAGE_UNHIDE = "chat_message.unhide";
export const CHAT_ADMIN_AUDIT_REPORT_ACTION = "chat_report.action";

/** 같은 관리자·방·사유의 열람 감사는 이 시간 안에서 1건만 남긴다 (실시간 새로고침 루프 방지). */
export const CHAT_ADMIN_CONTENT_VIEW_AUDIT_DEDUPE_MS = 30 * 60 * 1000;

export type ChatAdminContentDomain = "general_direct" | "group" | "trade" | "store_order";

export type ChatAdminContentBasis = "linked_report" | "linked_trade" | "linked_store_order" | "ghost";

export type ChatAdminContentDenial = "super_admin_only" | "ghost_reason_required";

export type ChatAdminContentDecision =
  | { granted: true; basis: ChatAdminContentBasis; ghost: boolean }
  | { granted: false; denial: ChatAdminContentDenial; ghost: true };

export function normalizeChatAdminReason(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, CHAT_ADMIN_REASON_MAX_LENGTH);
}

export function isChatAdminReasonValid(raw: unknown, min: number): boolean {
  return normalizeChatAdminReason(raw).length >= min;
}

/**
 * CM 방 도메인 — `chat_domain` 컬럼 우선. 비어 있으면 direct_key·room_type 으로 보수적 판정
 * (모르면 general_direct = 가장 엄격).
 */
export function resolveCmRoomContentDomain(room: {
  chat_domain?: string | null;
  room_type?: string | null;
  direct_key?: string | null;
}): ChatAdminContentDomain {
  const d = String(room.chat_domain ?? "").trim();
  if (d === "general_direct" || d === "group" || d === "trade" || d === "store_order") return d;
  const key = String(room.direct_key ?? "").trim();
  if (key.startsWith("store_order:")) return "store_order";
  if (key.startsWith("trade_item:") || key.startsWith("trade_pc:") || key.startsWith("trade_order:")) {
    return "trade";
  }
  const rt = String(room.room_type ?? "").trim();
  if (rt === "private_group" || rt === "open_group" || rt === "group") return "group";
  return "general_direct";
}

/**
 * 방 유형별 Admin 권한 (설계 §2-2 단일 규칙) — 열람·본문·첨부·조치·신고 처리 공통.
 * 거래 방은 거래 담당(`products`), 배달 주문 방은 배달 담당(`business`)도 채팅 Admin 없이 처리한다.
 * 고스트 열람(연결 없는 1:1·그룹 본문)은 별도로 super_admin 만 (`decideChatContentAccess`).
 */
export function chatRoomAdminPermissionKeys(domain: ChatAdminContentDomain): Array<"chats" | "products" | "business"> {
  if (domain === "trade") return ["chats", "products"];
  if (domain === "store_order") return ["chats", "business"];
  return ["chats"];
}

/** 레거시 거래 채팅 Admin API (`/api/admin/chat/rooms*`·`/api/admin/chats`) — 거래 방 규칙과 동일. */
export const TRADE_CHAT_ADMIN_PERMISSION_KEYS = chatRoomAdminPermissionKeys("trade");

/** 열린 신고 상태 (CM reports CHECK: received·reviewing·resolved·rejected·sanctioned). */
export const CM_REPORT_OPEN_STATUSES = ["received", "reviewing"] as const;
export const CM_REPORT_CLOSED_STATUSES = ["resolved", "rejected", "sanctioned"] as const;

export function decideChatContentAccess(input: {
  domain: ChatAdminContentDomain;
  hasOpenReport: boolean;
  linkedStoreOrder: boolean;
  isSuperAdmin: boolean;
  reason: string;
}): ChatAdminContentDecision {
  if (input.domain === "store_order" || input.linkedStoreOrder) {
    return { granted: true, basis: "linked_store_order", ghost: false };
  }
  if (input.domain === "trade") {
    return { granted: true, basis: "linked_trade", ghost: false };
  }
  if (input.hasOpenReport) {
    return { granted: true, basis: "linked_report", ghost: false };
  }
  if (!input.isSuperAdmin) {
    return { granted: false, denial: "super_admin_only", ghost: true };
  }
  if (!isChatAdminReasonValid(input.reason, CHAT_ADMIN_GHOST_REASON_MIN_LENGTH)) {
    return { granted: false, denial: "ghost_reason_required", ghost: true };
  }
  return { granted: true, basis: "ghost", ghost: true };
}

/** CM 신고 조치 → 다음 상태. 종결 상태에서는 어떤 조치도 받지 않는다 (CAS 409). */
export type CmReportAdminAction =
  | "reviewing"
  | "resolved"
  | "rejected"
  | "sanction_message_hide"
  | "sanction_room_block";

export function cmReportNextStatus(action: CmReportAdminAction): "reviewing" | "resolved" | "rejected" | "sanctioned" {
  if (action === "reviewing") return "reviewing";
  if (action === "rejected") return "rejected";
  if (action === "resolved") return "resolved";
  return "sanctioned";
}

export function cmReportTransitionAllowed(currentStatus: string, action: CmReportAdminAction): boolean {
  const cur = String(currentStatus ?? "").trim();
  if ((CM_REPORT_CLOSED_STATUSES as readonly string[]).includes(cur)) return false;
  if (action === "reviewing") return cur === "received";
  return (CM_REPORT_OPEN_STATUSES as readonly string[]).includes(cur);
}

/** CM 방 조치 → 갱신 패치·이미 적용 여부 */
export type CmRoomAdminAction =
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";

export function cmRoomActionAlreadyApplied(
  room: { room_status?: string | null; is_readonly?: boolean | null },
  action: CmRoomAdminAction
): boolean {
  const status = String(room.room_status ?? "active");
  switch (action) {
    case "block_room":
      return status === "blocked";
    case "unblock_room":
      return status !== "blocked";
    case "archive_room":
      return status === "archived";
    case "unarchive_room":
      return status !== "archived";
    case "readonly_on":
      return room.is_readonly === true;
    case "readonly_off":
      return room.is_readonly !== true;
    default:
      return false;
  }
}
