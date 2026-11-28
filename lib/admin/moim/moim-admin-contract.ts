/**
 * 모임 어드민 계약 (설계 docs/design/moim/moim-design-v1-2026-11-12.md §8 · M5) — 화면·API 공용 상수와 응답 모양.
 * 클라이언트 안전 (서버 모듈 import 없음).
 *
 * 권한: 권한 키 `moim` 하나로 조회·수정·제재를 판정한다 (설계의 하위 키 moim.view/edit/sanction/report 는
 * 이 코드베이스의 권한 키 구조가 단일 키라 나누지 않았다). 모임 삭제·복구·콘텐츠 「삭제」는 최고관리자만.
 */

import { MOIM_POLICY_CODE_RE } from "@/lib/moim/moim-report-reasons";

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

/** M6 신고 처리 (SQL moim_admin_report_decide 와 같은 값) */
export const MOIM_ADMIN_REPORT_DECISIONS = ["actioned", "dismissed"] as const;
export type MoimAdminReportDecision = (typeof MOIM_ADMIN_REPORT_DECISIONS)[number];
export const MOIM_ADMIN_RESTRICT_WHO = ["target", "host"] as const;
export type MoimAdminRestrictWho = (typeof MOIM_ADMIN_RESTRICT_WHO)[number];
export const MOIM_ADMIN_RESTRICTIONS = ["post", "comment", "all"] as const;
export type MoimAdminRestriction = (typeof MOIM_ADMIN_RESTRICTIONS)[number];
/** 이용 제한 기간(일) 선택지 — 빈 값 = 영구 */
export const MOIM_ADMIN_RESTRICT_DAY_OPTIONS = [1, 3, 7, 14, 30, 90] as const;
export const MOIM_ADMIN_RESTRICT_DAYS_MAX = 3650;
/** 콘텐츠 숨김을 줄 수 없는 대상 (모임·멤버는 모임 제재·이용 제한으로 처리) */
export const MOIM_ADMIN_NO_CONTENT_HIDE_TARGETS: readonly MoimAdminReportTargetType[] = ["moim", "member"];
export function isMoimAdminOpenReportStatus(v: unknown): v is "received" | "reviewing" {
  return v === "received" || v === "reviewing";
}

/** 모임 신고 큐의 「모임 채팅방 메신저 신고」 보기 — 메신저 신고 상태 → 모임 큐 탭 */
export const MOIM_ADMIN_MESSENGER_STATUS_BY_TAB: Record<MoimAdminReportStatus, readonly string[]> = {
  received: ["received"],
  reviewing: ["reviewing"],
  actioned: ["resolved", "sanctioned"],
  dismissed: ["rejected"],
};

export const MOIM_ADMIN_HOST_REQUEST_STATUSES = ["requested", "done", "declined", "cancelled", "all"] as const;
export type MoimAdminHostRequestStatus = (typeof MOIM_ADMIN_HOST_REQUEST_STATUSES)[number];

/** 제재 이력 필터 — expiring = 진행 중이면서 7일 안에 끝남 */
export const MOIM_ADMIN_SANCTION_FILTERS = ["active", "expiring", "expired", "revoked", "all"] as const;
export type MoimAdminSanctionFilter = (typeof MOIM_ADMIN_SANCTION_FILTERS)[number];

export const MOIM_ADMIN_SANCTION_LEVELS = ["unlist", "warn", "block"] as const;
export type MoimAdminSanctionLevel = (typeof MOIM_ADMIN_SANCTION_LEVELS)[number];
/**
 * 끝나는 날을 정할 수 있는 모임 제재 (R4 D-14) — 추천 제외만. 경고·차단은 종료일 없이 어드민이 해제할 때까지 이어진다
 * (SQL moim_admin_sanction_apply·moim_admin_report_decide 가 `moim_sanction_period_not_allowed` 로 거부 · 표 CHECK).
 */
export const MOIM_ADMIN_PERIOD_LEVELS: readonly MoimAdminSanctionLevel[] = ["unlist"];
export function moimAdminLevelAllowsPeriod(level: unknown): boolean {
  return typeof level === "string" && (MOIM_ADMIN_PERIOD_LEVELS as readonly string[]).includes(level);
}

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

/** 금지어 최대 개수 (SQL 과 같음) · 한 단어 최대 길이 — 가입 질문 금지어(question_banned_words)도 같은 규칙 */
export const MOIM_ADMIN_BANNED_WORDS_MAX = 500;
export const MOIM_ADMIN_BANNED_WORD_MAX_LEN = 40;
/** 단어 목록 정책 키 (R4 §3) */
export const MOIM_ADMIN_POLICY_WORD_KEYS = ["banned_words", "question_banned_words"] as const;
export type MoimAdminPolicyWordKey = (typeof MOIM_ADMIN_POLICY_WORD_KEYS)[number];

/** 금지 모임 유형·신고 사유 목록 (R4 §3 · SQL moim_admin_policies_save 와 같은 상한) */
export const MOIM_ADMIN_PROHIBITED_TYPES_MAX = 20;
export const MOIM_ADMIN_REPORT_REASONS_MAX = 30;
export const MOIM_ADMIN_POLICY_LABEL_MAX_LEN = 80;

/** 저장 요청의 목록 항목 (DB jsonb 모양 · snake_case) */
export type MoimAdminPolicyLabelRow = { code: string; label_ko: string; label_en: string };
export type MoimAdminReportReasonRow = MoimAdminPolicyLabelRow & { is_active: boolean };

/**
 * 목록 항목 검사 (SQL 과 같은 규칙) — 코드 `^[a-z_]{2,40}$`·겹침 없음 · 한국어 이름 1~80자(필수) · 영어 이름 0~80자.
 * 신고 사유는 is_active 가 boolean 이어야 한다(없으면 켜짐). 틀리면 null.
 */
export function parseMoimAdminPolicyRows(raw: unknown, kind: "prohibited_types"): MoimAdminPolicyLabelRow[] | null;
export function parseMoimAdminPolicyRows(raw: unknown, kind: "report_reasons"): MoimAdminReportReasonRow[] | null;
export function parseMoimAdminPolicyRows(
  raw: unknown,
  kind: "prohibited_types" | "report_reasons"
): MoimAdminPolicyLabelRow[] | MoimAdminReportReasonRow[] | null;
export function parseMoimAdminPolicyRows(raw: unknown, kind: "prohibited_types" | "report_reasons"): MoimAdminPolicyLabelRow[] | MoimAdminReportReasonRow[] | null {
  if (!Array.isArray(raw)) return null;
  const max = kind === "report_reasons" ? MOIM_ADMIN_REPORT_REASONS_MAX : MOIM_ADMIN_PROHIBITED_TYPES_MAX;
  if (raw.length > max) return null;
  const seen = new Set<string>();
  const out: MoimAdminReportReasonRow[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object" || Array.isArray(it)) return null;
    const o = it as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : "";
    if (!MOIM_POLICY_CODE_RE.test(code) || seen.has(code)) return null;
    seen.add(code);
    const ko = typeof o.label_ko === "string" ? o.label_ko.trim() : "";
    if (o.label_en != null && typeof o.label_en !== "string") return null;
    const en = typeof o.label_en === "string" ? o.label_en.trim() : "";
    if (ko.length < 1 || ko.length > MOIM_ADMIN_POLICY_LABEL_MAX_LEN || en.length > MOIM_ADMIN_POLICY_LABEL_MAX_LEN) return null;
    if (o.is_active != null && typeof o.is_active !== "boolean") return null;
    out.push({ code, label_ko: ko, label_en: en, is_active: o.is_active !== false });
  }
  if (kind === "report_reasons") return out;
  return out.map(({ code, label_ko, label_en }) => ({ code, label_ko, label_en }));
}

/** 정책 1행 (GET 응답 · 새 열은 옛 DB 에 없을 수 있다) */
export type MoimAdminPoliciesRow = Record<string, unknown> & {
  updated_at: string;
  banned_words: string[] | null;
  question_banned_words?: string[] | null;
  prohibited_types?: MoimAdminPolicyLabelRow[] | null;
  report_reasons?: MoimAdminReportReasonRow[] | null;
};

/** 저장된 신고 사유 중 새 목록에서 빠진 코드 (R4 §3 — 지우지 않고 끈다 · SQL 은 `moim_policy_report_reason_removed`) */
export function removedMoimReportReasonCodes(before: readonly { code: string }[] | null | undefined, next: readonly { code: string }[]): string[] {
  const keep = new Set(next.map((r) => r.code));
  return (before ?? []).map((r) => r.code).filter((c) => !keep.has(c));
}

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
  /** 직접 주제 (「기타」 등) */
  topicLabel: string | null;
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
  /** 이 카테고리를 고르면 모임장이 주제를 직접 적는다 */
  allowCustomTopic: boolean;
  updatedAt: string;
};

/** 직접 입력 주제 많이 쓰인 순 (정식 카테고리 추가 판단 자료) */
export type MoimAdminTopicRankRow = { topic: string; moimCount: number };

export function isMoimAdminListTab(v: unknown): v is MoimAdminListTab {
  return typeof v === "string" && (MOIM_ADMIN_LIST_TABS as readonly string[]).includes(v);
}

export function pickEnum<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}
