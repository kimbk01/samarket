/**
 * ARO-OPS-UX-001-W1 — Shared Domain Management contract types.
 * Presentation / interaction only — not a new mutation or finance authority.
 */

export type OperationalFrequencyClass =
  | "DAILY_CRITICAL"
  | "FREQUENT"
  | "OCCASIONAL"
  | "CONFIGURATION"
  | "ARCHIVE";

/** Order for sidebar / page priority within a domain group (1 = highest). */
export const OPERATIONAL_FREQUENCY_ORDER: Record<OperationalFrequencyClass, number> = {
  DAILY_CRITICAL: 1,
  FREQUENT: 2,
  OCCASIONAL: 3,
  CONFIGURATION: 4,
  ARCHIVE: 5,
};

export type AdminManagementWorkspace =
  | "DELIVERY"
  | "TRADE"
  | "COMMUNITY"
  | "MESSENGER"
  | "OPERATIONS"
  | "FINANCE"
  | "ADS_EXPOSURE"
  | "SUPPORT"
  | "NOTIFICATIONS"
  | "SYSTEM";

export type ManagementSurfaceKind = "TABLE" | "CARD" | "DETAIL" | "FORM";

export type SelectAllScope = "CURRENT_PAGE" | "FILTER_RESULT" | "GLOBAL_DB";

/** W1 default — never use GLOBAL_DB for domain list management. */
export const DEFAULT_SELECT_ALL_SCOPE: SelectAllScope = "CURRENT_PAGE";

export type DeleteMode =
  | "HARD_DELETE"
  | "SOFT_DELETE"
  | "HIDE_ONLY"
  | "STATUS_ONLY"
  | "BLOCKED";

export type BulkActionId =
  | "hide"
  | "restore"
  | "soft_delete"
  | "hard_delete"
  | "change_status"
  | "cancel"
  | "approve";

export type ManagementColumnKind =
  | "SELECTION"
  | "IDENTITY"
  | "TITLE"
  | "STATUS"
  | "NUMERIC"
  | "DATE"
  | "METADATA"
  | "ACTIONS";

export type ManagementCtaVariant =
  | "PRIMARY"
  | "SECONDARY"
  | "TERTIARY"
  | "STATUS"
  | "DANGER"
  /** Hard/permanent delete — stronger than DANGER; reuses danger token + emphasis. */
  | "CRITICAL_DANGER";


export type ManagementListState = "LOADING" | "EMPTY" | "ERROR" | "PERMISSION_DENIED" | "READY";

export type AdminTerminologyConcept =
  | "MEMBER"
  | "STORE"
  | "OWNER"
  | "PRODUCT"
  | "MENU"
  | "CATEGORY"
  | "POST"
  | "COMMENT"
  | "REPORT"
  | "MEETING_REPORT"
  | "SUPPORT_CASE"
  | "ADVERTISEMENT"
  | "PROMOTION"
  | "EXPOSURE"
  | "POINT"
  | "COIN"
  | "CASH"
  | "SETTLEMENT"
  | "WITHDRAWAL"
  | "CHARGE"
  | "CONVERT"
  | "DELETE"
  /** Soft / status delete — never bare 「삭제」 alone for ops CTAs. */
  | "SOFT_DELETE"
  /** Permanent DB row removal — never bare 「삭제」. */
  | "HARD_DELETE"
  | "HIDE"
  | "RESTORE"
  | "DEACTIVATE"
  | "RECEIVE"
  | "REVIEW"
  | "APPROVE"
  | "COMPLETE"
  | "CANCEL"
  | "DETAIL"
  | "MANAGE";
