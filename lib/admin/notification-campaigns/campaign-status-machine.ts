/**
 * ADM-09 — admin notification campaign status SSOT.
 *
 * - `CAMPAIGN_STATUSES` mirrors the DB CHECK `admin_notification_campaigns_status_check`
 *   (migration 20261029120000; prod values observed: draft, scheduled, active, sending, sent,
 *   partially_failed — paused/ended/cancelled/failed are reachable through the lifecycle below).
 * - `CAMPAIGN_STATUS_TRANSITIONS` is the ONLY transition table. Every mutating route checks it
 *   (`canTransitionCampaignStatus`). It is mirrored in SQL by
 *   `public.admin_notification_campaign_status_transition_allowed(text, text)`
 *   (migration 20270516120000) — a contract test keeps both lists identical.
 * - `CAMPAIGN_CLAIM_BLOCKED_STATUSES` mirrors the claim RPC filter
 *   (`claim_due_admin_notification_campaign_occurrence`: `c.status NOT IN (...)`).
 *
 * Client-safe: no server imports.
 */

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "ended",
  "cancelled",
  "sending",
  "sent",
  "partially_failed",
  "failed",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export function isCampaignStatus(v: unknown): v is CampaignStatus {
  return typeof v === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}

/**
 * from → allowed next statuses.
 * - draft → scheduled (예약) · active (반복 시작) · sending (발송) · cancelled
 * - scheduled → sending (cron claim/batch) · cancelled (예약 취소 — 「취소됨」, never back to draft)
 *   · failed (source re-verification / batch failure)
 * - sending → sent · partially_failed · failed (terminal by metrics) · cancelled (발송 중지)
 * - active (반복) → paused · ended (반복 중지) · sending is NOT a campaign status for recurring
 * - paused → active (재개) · ended (반복 중지)
 * - failed → sending (재발송 of a failed occurrence)
 * - sent / partially_failed / cancelled / ended → terminal (복제만 가능)
 */
export const CAMPAIGN_STATUS_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["scheduled", "active", "sending", "cancelled"],
  scheduled: ["sending", "cancelled", "failed"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: [],
  cancelled: [],
  sending: ["sent", "partially_failed", "failed", "cancelled"],
  sent: [],
  partially_failed: [],
  failed: ["sending"],
};

export function canTransitionCampaignStatus(from: string, to: string): boolean {
  if (!isCampaignStatus(from) || !isCampaignStatus(to)) return false;
  return CAMPAIGN_STATUS_TRANSITIONS[from].includes(to);
}

export function assertCampaignStatusTransition(
  from: string,
  to: string
): { ok: true } | { ok: false; error: "illegal_status_transition"; from: string; to: string } {
  if (canTransitionCampaignStatus(from, to)) return { ok: true };
  return { ok: false, error: "illegal_status_transition", from, to };
}

/** Claim RPC skips occurrences whose campaign has one of these statuses. */
export const CAMPAIGN_CLAIM_BLOCKED_STATUSES = ["cancelled", "ended", "paused"] as const;

/** Batch runner stops an in-flight occurrence when the campaign reaches one of these. */
export const CAMPAIGN_HALTED_STATUSES = ["cancelled", "ended"] as const;

export function isCampaignHaltedStatus(status: string): boolean {
  return (CAMPAIGN_HALTED_STATUSES as readonly string[]).includes(status);
}

/** ADM-04: content edit form is open only in these statuses. */
export const CAMPAIGN_EDITABLE_STATUSES = ["draft", "scheduled", "paused"] as const;

export function isCampaignEditableStatus(status: string): boolean {
  return (CAMPAIGN_EDITABLE_STATUSES as readonly string[]).includes(status);
}

/** Archive hides a campaign from the working tabs; only for campaigns with nothing in flight. */
export const CAMPAIGN_ARCHIVABLE_STATUSES = [
  "draft",
  "sent",
  "partially_failed",
  "failed",
  "cancelled",
  "ended",
] as const;

export const CAMPAIGN_ACTIONS = [
  "edit",
  "send",
  "schedule",
  "cancel",
  "stop_sending",
  "pause",
  "resume",
  "stop_recurring",
  "resend",
  "archive",
  "unarchive",
  "duplicate",
] as const;

export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number];

export function isCampaignAction(v: unknown): v is CampaignAction {
  return typeof v === "string" && (CAMPAIGN_ACTIONS as readonly string[]).includes(v);
}

/** Target status each status-changing action requests (checked against the transition table). */
export const CAMPAIGN_ACTION_TARGET_STATUS: Partial<Record<CampaignAction, CampaignStatus>> = {
  send: "sending",
  cancel: "cancelled",
  stop_sending: "cancelled",
  pause: "paused",
  resume: "active",
  stop_recurring: "ended",
  resend: "sending",
};

export type CampaignActionContext = {
  status: string;
  sendMode?: string | null;
  archived?: boolean;
  isQa?: boolean;
  channel?: string | null;
  /** A non-test occurrence exists that is sending or already completed (sent/partially_failed). */
  hasDispatchedOccurrence?: boolean;
  /** A non-test occurrence in `failed` exists (resend candidate). */
  hasFailedOccurrence?: boolean;
};

/**
 * Single action gate for routes and UI. Returns a reason code when not allowed.
 */
export function evaluateCampaignAction(
  action: CampaignAction,
  ctx: CampaignActionContext
): { ok: true } | { ok: false; error: string } {
  const status = String(ctx.status ?? "");
  const recurring = String(ctx.sendMode ?? "") === "recurring";
  if (ctx.archived && action !== "unarchive" && action !== "duplicate") {
    return { ok: false, error: "campaign_archived" };
  }
  switch (action) {
    case "duplicate":
      return { ok: true };
    case "unarchive":
      return ctx.archived ? { ok: true } : { ok: false, error: "campaign_not_archived" };
    case "archive":
      return (CAMPAIGN_ARCHIVABLE_STATUSES as readonly string[]).includes(status)
        ? { ok: true }
        : { ok: false, error: "campaign_not_archivable" };
    case "edit":
      if (!isCampaignEditableStatus(status)) return { ok: false, error: "campaign_not_editable" };
      if (status === "draft" && ctx.hasDispatchedOccurrence) {
        return { ok: false, error: "campaign_already_dispatched" };
      }
      return { ok: true };
    case "schedule":
      // draft → scheduled (one-shot) or active (recurring); scheduled keeps status on reschedule.
      if (status === "scheduled") return { ok: true };
      if (status !== "draft") return { ok: false, error: "illegal_status_transition" };
      if (ctx.hasDispatchedOccurrence) return { ok: false, error: "campaign_already_dispatched" };
      if (ctx.channel === "test_only") return { ok: false, error: "test_only_use_test_send_endpoint" };
      return { ok: true };
    case "send":
      if (status !== "draft") return { ok: false, error: "illegal_status_transition" };
      if (ctx.hasDispatchedOccurrence) return { ok: false, error: "campaign_already_dispatched" };
      if (ctx.channel === "test_only") return { ok: false, error: "test_only_use_test_send_endpoint" };
      return { ok: true };
    case "resend":
      if (!ctx.hasFailedOccurrence) return { ok: false, error: "no_failed_occurrence" };
      return canTransitionCampaignStatus(status, "sending") || (recurring && status === "active")
        ? { ok: true }
        : { ok: false, error: "illegal_status_transition" };
    case "cancel":
      // cancel = scheduled one-shot reservation → 「취소됨」 (recurring uses stop_recurring)
      if (recurring) return { ok: false, error: "use_stop_recurring" };
      return canTransitionCampaignStatus(status, "cancelled") && status !== "sending"
        ? { ok: true }
        : { ok: false, error: "illegal_status_transition" };
    case "stop_sending":
      return status === "sending" ? { ok: true } : { ok: false, error: "illegal_status_transition" };
    case "pause":
    case "resume":
    case "stop_recurring": {
      if (!recurring) return { ok: false, error: "not_recurring" };
      const to = CAMPAIGN_ACTION_TARGET_STATUS[action] as CampaignStatus;
      return canTransitionCampaignStatus(status, to)
        ? { ok: true }
        : { ok: false, error: "illegal_status_transition" };
    }
    default:
      return { ok: false, error: "unknown_action" };
  }
}

export function allowedCampaignActions(ctx: CampaignActionContext): CampaignAction[] {
  return CAMPAIGN_ACTIONS.filter((a) => evaluateCampaignAction(a, ctx).ok);
}

/* ------------------------------------------------------------------ */
/* ADM-05 list tabs                                                    */
/* ------------------------------------------------------------------ */

export const CAMPAIGN_LIST_TABS = ["drafting", "in_progress", "completed", "archived", "qa"] as const;
export type CampaignListTab = (typeof CAMPAIGN_LIST_TABS)[number];
/** 알림 발송 v3 (2026-10-30): 목록 기본 = 보낸 알림. */
export const CAMPAIGN_LIST_DEFAULT_TAB: CampaignListTab = "completed";

export const CAMPAIGN_TAB_STATUSES: Readonly<Record<"drafting" | "in_progress" | "completed", readonly CampaignStatus[]>> = {
  drafting: ["draft"],
  in_progress: ["scheduled", "sending", "active", "paused"],
  completed: ["sent", "partially_failed", "failed", "cancelled", "ended"],
};

export function campaignTabForStatus(status: string): "drafting" | "in_progress" | "completed" | null {
  for (const tab of ["drafting", "in_progress", "completed"] as const) {
    if ((CAMPAIGN_TAB_STATUSES[tab] as readonly string[]).includes(status)) return tab;
  }
  return null;
}

export const CAMPAIGN_LIST_DEFAULT_PAGE_SIZE = 20;
export const CAMPAIGN_LIST_MAX_PAGE_SIZE = 100;

export type CampaignListQuery = {
  tab: CampaignListTab;
  page: number;
  pageSize: number;
  status: CampaignStatus | null;
  type: "notice" | "marketing" | "system" | null;
  q: string | null;
};

function readPositiveInt(raw: string | null, fallback: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < 1) return fallback;
  return Math.min(i, max);
}

/**
 * Parses list params (URL query of both the admin page and the API). Unknown values fall back to
 * defaults; a status filter outside the selected tab is dropped (tab wins).
 * Legacy `audience=qa` maps to the QA tab.
 */
export function parseCampaignListQuery(sp: URLSearchParams): CampaignListQuery {
  const tabRaw = sp.get("tab")?.trim() ?? "";
  let tab: CampaignListTab = (CAMPAIGN_LIST_TABS as readonly string[]).includes(tabRaw)
    ? (tabRaw as CampaignListTab)
    : CAMPAIGN_LIST_DEFAULT_TAB;
  if (!tabRaw && sp.get("audience")?.trim() === "qa") tab = "qa";
  const page = readPositiveInt(sp.get("page"), 1, 100_000);
  const pageSize = readPositiveInt(
    sp.get("page_size") ?? sp.get("pageSize"),
    CAMPAIGN_LIST_DEFAULT_PAGE_SIZE,
    CAMPAIGN_LIST_MAX_PAGE_SIZE
  );
  const statusRaw = sp.get("status")?.trim() ?? "";
  let status: CampaignStatus | null = isCampaignStatus(statusRaw) ? statusRaw : null;
  if (status && (tab === "drafting" || tab === "in_progress" || tab === "completed")) {
    if (!(CAMPAIGN_TAB_STATUSES[tab] as readonly string[]).includes(status)) status = null;
  }
  const typeRaw = sp.get("type")?.trim() ?? "";
  const type =
    typeRaw === "notice" || typeRaw === "marketing" || typeRaw === "system" ? typeRaw : null;
  const qRaw = sp.get("q")?.trim() ?? "";
  const q = qRaw ? qRaw.slice(0, 80) : null;
  return { tab, page, pageSize, status, type, q };
}

/** Serialises a list query to URL params (defaults omitted so URLs stay short). */
export function campaignListQueryToSearchParams(q: CampaignListQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.tab !== CAMPAIGN_LIST_DEFAULT_TAB) sp.set("tab", q.tab);
  if (q.page > 1) sp.set("page", String(q.page));
  if (q.pageSize !== CAMPAIGN_LIST_DEFAULT_PAGE_SIZE) sp.set("page_size", String(q.pageSize));
  if (q.status) sp.set("status", q.status);
  if (q.type) sp.set("type", q.type);
  if (q.q) sp.set("q", q.q);
  return sp;
}

export function campaignListRange(q: Pick<CampaignListQuery, "page" | "pageSize">): { from: number; to: number } {
  const from = (q.page - 1) * q.pageSize;
  return { from, to: from + q.pageSize - 1 };
}

/** ILIKE pattern with `%`/`_`/`\` escaped so a search term is matched literally. */
export function campaignTitleSearchPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

const STATUS_LABEL_KO: Record<CampaignStatus, string> = {
  draft: "작성 중",
  scheduled: "예약됨",
  active: "반복 활성",
  paused: "일시정지",
  ended: "종료",
  cancelled: "취소됨",
  sending: "발송 중",
  sent: "발송 완료",
  partially_failed: "부분 실패",
  failed: "실패",
};

const STATUS_LABEL_EN: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Recurring active",
  paused: "Paused",
  ended: "Ended",
  cancelled: "Cancelled",
  sending: "Sending",
  sent: "Sent",
  partially_failed: "Partially failed",
  failed: "Failed",
};

export function campaignStatusLabel(status: string, lang: "ko" | "en" = "ko"): string {
  if (!isCampaignStatus(status)) return status || "—";
  return lang === "en" ? STATUS_LABEL_EN[status] : STATUS_LABEL_KO[status];
}

export const CAMPAIGN_TAB_LABEL_KO: Record<CampaignListTab, string> = {
  drafting: "초안",
  in_progress: "발송 중·예약",
  completed: "보낸 알림",
  archived: "삭제한 알림",
  qa: "테스트",
};

export const CAMPAIGN_TAB_LABEL_EN: Record<CampaignListTab, string> = {
  drafting: "Drafts",
  in_progress: "Sending · scheduled",
  completed: "Sent",
  archived: "Deleted",
  qa: "Tests",
};

/**
 * Legacy rows (before occurrence cutover) could stay `draft` after their first real occurrence
 * finished. Display them by the occurrence outcome; migration 20270516120000 backfills the row.
 */
export function resolveEffectiveCampaignStatus(
  status: string,
  latestRealOccurrenceStatus: string | null | undefined
): string {
  if (status !== "draft") return status;
  const occ = String(latestRealOccurrenceStatus ?? "");
  if (occ === "sent" || occ === "partially_failed" || occ === "failed" || occ === "sending") return occ;
  return status;
}
