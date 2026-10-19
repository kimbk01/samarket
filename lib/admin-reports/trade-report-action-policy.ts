import type { ReportActionType } from "@/lib/types/daangn";

/**
 * Trade report action policy — shared by client panel (CTA gating) and
 * server route `/api/admin/reports/[reportId]/action`. No DB access here.
 */

/** Trade report content actions — mutate reports / posts only. */
export const TRADE_REPORT_CONTENT_ACTIONS: ReadonlySet<ReportActionType> = new Set([
  "reject",
  "product_hide",
]);

/**
 * Account-enforcing actions — MCC only (`/api/admin/users/[id]/moderation`).
 * Must NOT write `sanctions` or masquerade as profile ban.
 */
export const TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY: ReadonlySet<ReportActionType> = new Set([
  "account_suspend",
  "account_ban",
]);

/** Non-enforcing ledger notes (warn/chat_ban) — require a real profiles.id. */
export const TRADE_REPORT_LEDGER_ACTIONS: ReadonlySet<ReportActionType> = new Set([
  "warn",
  "chat_ban",
]);

export const REPORT_STATUS_BY_ACTION: Record<ReportActionType, string> = {
  reject: "rejected",
  warn: "sanctioned",
  chat_ban: "sanctioned",
  product_hide: "sanctioned",
  account_suspend: "sanctioned",
  account_ban: "sanctioned",
};

/** report_actions → sanctions sanction_type 매핑 (ledger-only; not MCC enforcement) */
export const SANCTION_TYPE_MAP: Partial<Record<ReportActionType, string>> = {
  warn: "warning",
  chat_ban: "chat_ban",
};

export const TRADE_REPORT_ACTION_TYPES: ReadonlySet<ReportActionType> = new Set(
  Object.keys(REPORT_STATUS_BY_ACTION) as ReportActionType[]
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeProfileUserId(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function isChatReportTargetType(targetType: unknown): boolean {
  const tt = String(targetType ?? "").toLowerCase();
  return tt === "chat" || tt === "chat_room" || tt === "chat_message";
}
