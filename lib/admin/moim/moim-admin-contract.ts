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
 * 목록 항목 검사 (SQL 과 같은 규칙) — 코드 `^[a-z_]{2,40}$`·겹침 없음 · 한국어·영어 이름 1~80자(둘 다 필수 · R5 D20).
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
    /** R5 D20: 영어 이름도 1~80자 필수 (비면 영어 화면에 코드가 보인다 · SQL moim_admin_policies_save 도 거부) */
    if (ko.length < 1 || ko.length > MOIM_ADMIN_POLICY_LABEL_MAX_LEN || en.length < 1 || en.length > MOIM_ADMIN_POLICY_LABEL_MAX_LEN) return null;
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

/** R5 D6: 신고 사유는 하나 이상 켜져 있어야 저장할 수 있다 (SQL moim_policy_report_reason_none_active 와 같은 규칙) */
export function moimPolicyReasonsHaveActive(rows: readonly { is_active?: boolean }[] | null | undefined): boolean {
  return (rows ?? []).some((r) => r.is_active !== false);
}

/**
 * R5 D19: 빈 칸일 때 SQL 이 쓰는 기본값 (`coalesce(policy.<key>, n)` 확인). 여기 없는 키는 빈 칸 = 검사·작업 안 함
 * (SQL 이 `is not null and …` 로만 쓴다 — 2026-11-28 마이그레이션 확인).
 */
export const MOIM_ADMIN_POLICY_INT_DEFAULTS: Partial<Record<MoimAdminPolicyIntKey, number>> = {
  name_min_len: 1,
  name_max_len: 60,
  intro_min_len: 0,
  intro_max_len: 2000,
};

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

// ── R5 (2026-11-28) 어드민 공통 판정 ─────────────────────────────────────────

/**
 * R5 D §1-1: 모임 어드민 RPC 오류 → HTTP 번호 (서버 `moimAdminRpcResponse` 와 시험이 같은 표를 읽는다).
 * 404 는 「행이 정말 없음」만. 상태 때문에 못 하는 조치는 422(시트를 닫지 않고 그 코드 문장).
 */
export const MOIM_ADMIN_HTTP_409_CODES = ["moim_conflict", "moim_transfer_stale"] as const;
export const MOIM_ADMIN_HTTP_404_CODES = [
  "moim_not_found",
  "moim_report_not_found",
  "moim_sanction_not_found",
  "moim_content_not_found",
  "moim_transfer_not_found",
  "moim_ban_not_found",
] as const;
export const MOIM_ADMIN_HTTP_422_CODES = [
  "moim_closed",
  "moim_deleted",
  "moim_sanction_not_revocable",
  "moim_sanction_already_active",
  "moim_room_managed_by_moim",
  "moim_content_author_deleted",
  "moim_report_link_invalid",
] as const;

export function moimAdminHttpStatus(code: string): number {
  if ((MOIM_ADMIN_HTTP_409_CODES as readonly string[]).includes(code)) return 409;
  if ((MOIM_ADMIN_HTTP_404_CODES as readonly string[]).includes(code)) return 404;
  if ((MOIM_ADMIN_HTTP_422_CODES as readonly string[]).includes(code)) return 422;
  if (code === "moim_unknown") return 500;
  return 400;
}

export type MoimAdminMoimStatus = "active" | "closed" | "deleted";

/**
 * R5 D §1-2: 모임 상태 → 어드민이 할 수 있는 조치 (SQL `moim__admin_assert_state` 와 1:1 · 최종 판정은 서버).
 * 플랫폼 상태(추천 제외·경고·차단)는 어드민 조치를 막지 않는다 — 경고 중에도 모임장 지정·미접속 요청 승인 가능(Owner E18).
 * 삭제된 모임은 복구 전까지 조회만 — 단 신고 처리의 이용 제한·기각은 된다.
 */
export type MoimAdminAllowedActions = {
  /** 역할 변경 · 모임장 지정 · 미접속 요청 승인 — 운영 중만 */
  roleAndHost: boolean;
  /** 내보내기 · 차단 · 차단 해제 */
  members: boolean;
  /** 콘텐츠 숨김·숨김 해제·삭제·삭제 복구 · 일정 취소 */
  content: boolean;
  /** 모임 제재 적용 · 해제 */
  sanctions: boolean;
  /** 기본정보 수정 */
  editInfo: boolean;
  /** 신고 처리: 콘텐츠 숨김 · 모임 제재 */
  reportContentOrMoim: boolean;
  /** 신고 처리: 이용 제한 · 기각 */
  reportRestrictOrDismiss: boolean;
};

export function moimAdminAllowedActions(status: string | null | undefined): MoimAdminAllowedActions {
  const deleted = status === "deleted";
  const closed = status === "closed";
  return {
    roleAndHost: !deleted && !closed,
    members: !deleted,
    content: !deleted,
    sanctions: !deleted,
    editInfo: !deleted,
    reportContentOrMoim: !deleted,
    reportRestrictOrDismiss: true,
  };
}

/** R5 D2: 제재 이력 대상 종류 필터 — user = 이용 제한(대상 host·member) */
export const MOIM_ADMIN_SANCTION_KINDS = ["all", "moim", "content", "user"] as const;
export type MoimAdminSanctionKind = (typeof MOIM_ADMIN_SANCTION_KINDS)[number];

/** 뷰 `moim_admin_sanction_rows_v.live_state` (리드 결정 1 — 읽을 때 연결된 커뮤니티 제재·콘텐츠 상태를 붙여 읽는다) */
export const MOIM_ADMIN_SANCTION_LIVE_STATES = ["active", "expired", "revoked", "lifted", "unlinked"] as const;
export type MoimAdminSanctionLiveState = (typeof MOIM_ADMIN_SANCTION_LIVE_STATES)[number];

export type MoimAdminSanctionRowInput = {
  target_kind: string;
  target_id: string;
  level: string;
  revoked_at: string | null;
  ends_at: string | null;
  live_state?: string | null;
  report_target_type?: string | null;
  community_sanction_id?: string | null;
};

export type MoimAdminSanctionFollowUp = "content_posts" | "content_album" | "schedule_none" | "message_admin" | "user_restrictions" | null;

export type MoimAdminSanctionRowView = {
  kind: "moim" | "content" | "user";
  /** 화면 상태 — unlinked(연결 안 된 옛 이용 제한 행)는 지금 ends_at·revoked_at 기준으로 보인다 */
  state: "active" | "expired" | "revoked" | "lifted";
  /** 「해제」 버튼 — 모임 단위 행이 진행 중이고 모임이 삭제가 아닐 때만 */
  revocable: boolean;
  followUp: MoimAdminSanctionFollowUp;
};

function timeState(row: { revoked_at: string | null; ends_at: string | null }, nowMs: number): "active" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (row.ends_at && Date.parse(row.ends_at) <= nowMs) return "expired";
  return "active";
}

/** R5 D §1-3: 제재 행 보기 하나 — 모임 상세 「제재」 탭과 「제재 이력」 화면이 같이 쓴다 */
export function moimSanctionRowView(row: MoimAdminSanctionRowInput, moimStatus: string | null | undefined, nowMs: number = Date.now()): MoimAdminSanctionRowView {
  const kind: MoimAdminSanctionRowView["kind"] = row.target_kind === "moim" ? "moim" : row.target_kind === "content" ? "content" : "user";
  const live = (MOIM_ADMIN_SANCTION_LIVE_STATES as readonly string[]).includes(row.live_state ?? "") ? (row.live_state as MoimAdminSanctionLiveState) : null;
  const state: MoimAdminSanctionRowView["state"] = live && live !== "unlinked" ? live : timeState(row, nowMs);
  let followUp: MoimAdminSanctionFollowUp = null;
  if (kind === "user") followUp = "user_restrictions";
  if (kind === "content") {
    const t = row.report_target_type;
    followUp = t === "album" ? "content_album" : t === "schedule" ? "schedule_none" : t === "chat_message" ? "message_admin" : "content_posts";
  }
  return { kind, state, revocable: kind === "moim" && state === "active" && moimStatus !== "deleted", followUp };
}

/** R5 D §1-3: 후속 처리 링크 (없으면 null — 일정 취소는 되돌릴 수 없어 글만) */
export function moimSanctionFollowUpHref(
  view: MoimAdminSanctionRowView,
  row: { moim_id?: string | null; target_id: string; community_sanction_id?: string | null },
  ctx: { moimId: string; chatRoomId?: string | null }
): string | null {
  const moim = encodeURIComponent(row.moim_id || ctx.moimId);
  switch (view.followUp) {
    case "content_posts":
      return `/admin/community/moims/${moim}?tab=posts`;
    case "content_album":
      return `/admin/community/moims/${moim}?tab=album`;
    case "message_admin":
      return ctx.chatRoomId ? `/admin/chats/messenger/${encodeURIComponent(ctx.chatRoomId)}` : `/admin/community/moims/${moim}?tab=chats`;
    case "user_restrictions": {
      const qs = new URLSearchParams({ userId: row.target_id });
      if (row.community_sanction_id) qs.set("sanctionId", row.community_sanction_id);
      return `/admin/community/restrictions?${qs.toString()}`;
    }
    default:
      return null;
  }
}

/**
 * R5 D17: 운영기록 종류 (moim_events.type) — 마이그레이션이 남기는 값 전부. 화면은 `admin_moim_event_<type>` 문구,
 * 모르는 값은 「기타 기록」 + 원래 값은 접힌 기술 정보에만. 시험이 「마이그레이션 문자열 ⊂ 이 목록」을 확인한다.
 */
export const MOIM_EVENT_TYPES = [
  "created",
  "info_updated",
  "closed",
  "closed_retention_ended",
  "member_joined",
  "member_left",
  "member_removed",
  "member_banned",
  "member_unbanned",
  "role_changed",
  "permissions_updated",
  "host_changed",
  "host_transfer_requested",
  "host_transfer_declined",
  "host_transfer_cancelled",
  "host_inactive_requested",
  "join_requested",
  "join_approved",
  "join_rejected",
  "join_cancelled",
  "join_expired",
  "invite_sent",
  "invite_declined",
  "invite_link_created",
  "invite_link_revoked",
  "board_saved",
  "board_reordered",
  "post_created",
  "post_updated",
  "post_hidden",
  "post_deleted",
  "post_pinned",
  "post_unpinned",
  "comment_created",
  "comment_hidden",
  "comment_deleted",
  "album_added",
  "album_hidden",
  "album_deleted",
  "album_pinned",
  "album_unpinned",
  "profile_updated",
  "note_set",
  "note_deleted",
  "report_created",
  "sanction_expired",
  "sanction_dedup",
  "schedule_created",
  "schedule_updated",
  "schedule_cancelled",
  "schedule_done",
  "schedule_closed",
  "schedule_reopened",
  "schedule_requested",
  "schedule_approved",
  "schedule_rejected",
  "schedule_joined",
  "schedule_left",
  "schedule_participant_removed",
  "schedule_host_reassigned",
  "schedule_room_archived",
  "attendance_set",
  "admin_info_updated",
  "admin_deleted",
  "admin_restored",
  "admin_role_changed",
  "admin_host_assigned",
  "admin_host_request_approved",
  "admin_host_request_declined",
  "admin_member_removed",
  "admin_member_banned",
  "admin_member_unbanned",
  "admin_sanction_applied",
  "admin_sanction_revoked",
  "admin_schedule_cancelled",
  "admin_report_reviewing",
  "admin_report_actioned",
  "admin_report_dismissed",
  "admin_post_hide",
  "admin_post_restore",
  "admin_post_delete",
  "admin_post_undelete",
  "admin_comment_hide",
  "admin_comment_restore",
  "admin_comment_delete",
  "admin_comment_undelete",
  "admin_album_hide",
  "admin_album_restore",
  "admin_album_delete",
  "admin_album_undelete",
  "admin_category_created",
  "admin_category_updated",
  "admin_policies_updated",
  "admin_messenger_message_hidden",
  "admin_messenger_message_unhidden",
] as const;
export type MoimEventType = (typeof MOIM_EVENT_TYPES)[number];

export function isMoimEventType(v: unknown): v is MoimEventType {
  return typeof v === "string" && (MOIM_EVENT_TYPES as readonly string[]).includes(v);
}

/** R5 D27: 이용 제한 「대상」 이름 — 신고 대상 종류마다 (모임 대상은 SQL 이 모임장을 대상으로 잡는다) */
export const MOIM_ADMIN_WHO_TARGET_TYPES = ["member", "post", "comment", "album", "schedule", "chat_message"] as const;
