/**
 * 어드민 「매장 공지」(배달·매장 › 매장 › 매장 공지) 목록 모델 — 클라이언트·서버 공용 (설계 v3.2 §3-4 · Owner 2026-11-10).
 *
 * 원장 = `app_notices` 중 audience ≠ all (사장님 전용 운영 공지). 회원 「앱 공지」 와 같은 표·같은 쓰기 API.
 * - 게시 상태 = 사장님 화면과 같은 판정(`isCustomerCenterContentPublishedNow`)을 이유별로 나눈 것.
 * - 읽음 수 = 열람 기록(`customer_center_content_views`) 중 지금 대상 사장님인 사람 수(중복 없이).
 * - 대상 수 = 알림 받을 사장님 집계(`collectOwnerAnnouncementRecipients`)와 같은 규칙 — 지금 시각 기준.
 * - 알림 발송 결과 = 마지막 `app_notice.notify_store_owners` 감사 로그(대상·성공·실패·시각).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import type { OwnerAnnouncementAudience } from "@/lib/notices/app-notice-audience";

/** 어드민 매장 공지 화면 경로 (메뉴 leaf · 작성 · 수정) */
export const ADMIN_OWNER_NOTICES_PATH = "/admin/stores/owner-notices" as const;

export function adminOwnerNoticeCreatePath(): string {
  return `${ADMIN_OWNER_NOTICES_PATH}/create`;
}

export function adminOwnerNoticeEditPath(noticeId: string): string {
  return `${ADMIN_OWNER_NOTICES_PATH}/${encodeURIComponent(noticeId.trim())}/edit`;
}

/** 목록 최대 건수 — 운영 공지는 수십 건 규모라 페이지 없이 한 번에 (넘치면 `truncated`) */
export const ADMIN_OWNER_NOTICES_LIST_MAX = 200;

export const ADMIN_OWNER_NOTICE_PUBLISH_STATES = ["live", "scheduled", "ended", "hidden", "archived"] as const;
export type AdminOwnerNoticePublishState = (typeof ADMIN_OWNER_NOTICE_PUBLISH_STATES)[number];

export const ADMIN_OWNER_NOTICE_PUBLISH_STATE_LABEL_KEY: Record<AdminOwnerNoticePublishState, MessageKey> = {
  live: "admin_owner_notices_state_live",
  scheduled: "admin_owner_notices_state_scheduled",
  ended: "admin_owner_notices_state_ended",
  hidden: "admin_owner_notices_state_hidden",
  archived: "admin_owner_notices_state_archived",
};

/**
 * 게시 상태 — 보관 > 숨김 > 예약(시작 전) > 종료(종료 후) > 게시 중.
 * 「게시 중」 이 참인 조건은 `isCustomerCenterContentPublishedNow` 와 같다(사장님 화면에 나오는 글).
 */
export function adminOwnerNoticePublishState(
  row: {
    is_active?: boolean | null;
    starts_at?: string | null;
    ends_at?: string | null;
    archived_at?: string | null;
  },
  nowMs: number = Date.now()
): AdminOwnerNoticePublishState {
  if (row.archived_at) return "archived";
  if (!row.is_active) return "hidden";
  const start = row.starts_at ? Date.parse(String(row.starts_at)) : Number.NaN;
  if (Number.isFinite(start) && start > nowMs) return "scheduled";
  const end = row.ends_at ? Date.parse(String(row.ends_at)) : Number.NaN;
  if (Number.isFinite(end) && end < nowMs) return "ended";
  return "live";
}

export type AdminOwnerNoticeNotifyResult = {
  /** 발송 시각 (UTC ISO — 화면에서 PHT 로 표시) */
  at: string;
  recipients: number;
  sent: number;
  failed: number;
};

export type AdminOwnerNoticeListRow = {
  id: string;
  title: string;
  audience: OwnerAnnouncementAudience;
  isPinned: boolean;
  publishState: AdminOwnerNoticePublishState;
  /** 게시일 (published_at, 없으면 created_at — 사장님 화면 정렬과 같은 값) */
  publishedAt: string;
  startsAt: string | null;
  endsAt: string | null;
  /** 읽음 수 — 열람 기록 조회 실패 시 null (0 으로 꾸미지 않는다) */
  readCount: number | null;
  /** 대상 수 — 사장님 집계 실패 시 null */
  targetCount: number | null;
  /** 마지막 알림 발송 결과 — 보낸 적 없으면 null */
  notify: AdminOwnerNoticeNotifyResult | null;
  /** 알림 기록 조회 실패 (「보낸 적 없음」 과 구분) */
  notifyUnknown: boolean;
};

/** 감사 로그 `after_json` → 알림 결과 (숫자 아니면 버린다) */
export function parseOwnerNoticeNotifyAudit(
  afterJson: unknown,
  createdAt: string | null | undefined
): AdminOwnerNoticeNotifyResult | null {
  if (!afterJson || typeof afterJson !== "object") return null;
  const a = afterJson as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
  const recipients = num(a.recipients);
  const sent = num(a.sent);
  const failed = num(a.failed);
  if (![recipients, sent, failed].every(Number.isFinite)) return null;
  return { at: String(createdAt ?? ""), recipients, sent, failed };
}

/** 열람 기록(사용자 단위) ∩ 대상 사장님 → 읽음 수 (같은 사람이 여러 날 열어도 1) */
export function countOwnerNoticeReaders(viewerIds: Iterable<string>, targetOwnerIds: ReadonlySet<string>): number {
  let n = 0;
  const seen = new Set<string>();
  for (const id of viewerIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (targetOwnerIds.has(id)) n += 1;
  }
  return n;
}
