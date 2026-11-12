/**
 * 모임 어드민 계약 (설계 docs/design/moim/moim-design-v1-2026-11-12.md §8 · M5) — 화면·API 공용 상수와 응답 모양.
 * 클라이언트 안전 (서버 모듈 import 없음).
 *
 * 권한: 권한 키 `moim` 하나로 조회·수정·제재를 판정한다 (설계의 하위 키 moim.view/edit/sanction/report 는
 * 이 코드베이스의 권한 키 구조가 단일 키라 나누지 않았다). 모임 삭제·복구·콘텐츠 「삭제」는 최고관리자만.
 */

export const MOIM_ADMIN_LIST_TABS = ["all", "normal", "unlisted", "warned", "blocked", "closed", "deleted"] as const;
export type MoimAdminListTab = (typeof MOIM_ADMIN_LIST_TABS)[number];

/** 마지막 활동: 최근 7일·30일 안 / 30일·90일 넘게 없음 */
export const MOIM_ADMIN_ACTIVITY_FILTERS = ["7d", "30d", "idle30", "idle90"] as const;
export type MoimAdminActivityFilter = (typeof MOIM_ADMIN_ACTIVITY_FILTERS)[number];

/** 신고 수 하한 (전체 기간 · 모든 상태) */
export const MOIM_ADMIN_REPORT_MIN_OPTIONS = ["1", "3", "5", "10"] as const;

export const MOIM_ADMIN_DETAIL_TABS = [
  "info",
  "members",
  "requests",
  "posts",
  "schedules",
  "album",
  "chats",
  "reports",
  "sanctions",
  "events",
] as const;
export type MoimAdminDetailTab = (typeof MOIM_ADMIN_DETAIL_TABS)[number];

/** 상세 API `section` — 탭 + 댓글·프로필 변경 이력 */
export const MOIM_ADMIN_DETAIL_SECTIONS = [...MOIM_ADMIN_DETAIL_TABS, "comments", "profile_history"] as const;
export type MoimAdminDetailSection = (typeof MOIM_ADMIN_DETAIL_SECTIONS)[number];

export const MOIM_ADMIN_REPORT_STATUSES = ["received", "reviewing", "actioned", "dismissed"] as const;
export type MoimAdminReportStatus = (typeof MOIM_ADMIN_REPORT_STATUSES)[number];

export const MOIM_ADMIN_REPORT_TARGET_TYPES = ["moim", "member", "post", "comment", "schedule", "album", "chat_message"] as const;
export type MoimAdminReportTargetType = (typeof MOIM_ADMIN_REPORT_TARGET_TYPES)[number];

export const MOIM_ADMIN_HOST_REQUEST_STATUSES = ["requested", "done", "declined", "cancelled", "all"] as const;
export type MoimAdminHostRequestStatus = (typeof MOIM_ADMIN_HOST_REQUEST_STATUSES)[number];

/** 제재 이력 필터 — expiring = 진행 중이면서 7일 안에 끝남 */
export const MOIM_ADMIN_SANCTION_FILTERS = ["active", "expiring", "expired", "revoked", "all"] as const;
export type MoimAdminSanctionFilter = (typeof MOIM_ADMIN_SANCTION_FILTERS)[number];

export const MOIM_ADMIN_SANCTION_LEVELS = ["unlist", "warn", "block"] as const;
export type MoimAdminSanctionLevel = (typeof MOIM_ADMIN_SANCTION_LEVELS)[number];

export const MOIM_ADMIN_CONTENT_TYPES = ["post", "comment", "album", "schedule"] as const;
export type MoimAdminContentType = (typeof MOIM_ADMIN_CONTENT_TYPES)[number];
/** restore = 숨김 해제 · undelete = 삭제 복구(최고관리자) · delete = 최고관리자 · cancel = 일정만 */
export const MOIM_ADMIN_CONTENT_ACTIONS = ["hide", "restore", "delete", "undelete", "cancel"] as const;
export type MoimAdminContentAction = (typeof MOIM_ADMIN_CONTENT_ACTIONS)[number];

export const MOIM_ADMIN_MEMBER_ACTIONS = ["role", "remove", "ban", "unban", "assign_host"] as const;
export type MoimAdminMemberAction = (typeof MOIM_ADMIN_MEMBER_ACTIONS)[number];

/** 운영 정책 숫자 항목 (SQL moim_admin_policies_save 의 v_int_keys 와 같은 목록 · 빈 값 = null = 검사 안 함) */
export const MOIM_ADMIN_POLICY_INT_KEYS = [
  "max_moims_per_user",
  "max_capacity",
  "max_co_hosts",
  "max_staff",
  "max_custom_boards",
  "max_pinned_notices",
  "join_request_expire_days",
  "closed_retention_days",
  "schedule_room_archive_days",
  "invite_resend_days",
  "inactive_unlist_days",
  "name_min_len",
  "name_max_len",
  "intro_min_len",
  "intro_max_len",
] as const;
export type MoimAdminPolicyIntKey = (typeof MOIM_ADMIN_POLICY_INT_KEYS)[number];

/** 금지어 최대 개수 (SQL 과 같음) · 한 단어 최대 길이 */
export const MOIM_ADMIN_BANNED_WORDS_MAX = 500;
export const MOIM_ADMIN_BANNED_WORD_MAX_LEN = 40;

/** 사유 최소 글자 (SQL 은 공백만 아니면 통과 — 화면은 2자 이상) */
export const MOIM_ADMIN_REASON_MIN_LENGTH = 2;

export const MOIM_ADMIN_PAGE_DEFAULT = 50;
export const MOIM_ADMIN_PAGE_MAX = 100;

/** 목록·상세에 쓰는 사람 표시 (실제 계정 — 어드민만) */
export type MoimAdminPerson = {
  userId: string;
  nickname: string | null;
  dibayId: string | null;
  username: string | null;
  lastLoginAt?: string | null;
};

export type MoimAdminListRow = {
  id: string;
  name: string;
  status: string;
  platformState: string;
  categoryLabelKo: string | null;
  categoryLabelEn: string | null;
  lguId: string;
  lguLabel: string | null;
  memberCount: number;
  capacity: number | null;
  host: MoimAdminPerson | null;
  reportCount: number;
  lastActivityAt: string;
  createdAt: string;
};

export type MoimAdminCategoryRow = {
  id: string;
  slug: string;
  labelKo: string;
  labelEn: string;
  sortOrder: number;
  isActive: boolean;
  isRestricted: boolean;
  updatedAt: string;
};

export function isMoimAdminListTab(v: unknown): v is MoimAdminListTab {
  return typeof v === "string" && (MOIM_ADMIN_LIST_TABS as readonly string[]).includes(v);
}

export function pickEnum<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}
