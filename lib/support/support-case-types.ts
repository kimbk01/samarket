/**
 * Support case domain types — DB row shapes + status enums.
 */

export const SUPPORT_CASE_STATUSES = [
  "OPEN",
  "WAITING_ADMIN",
  "WAITING_USER",
  "RESOLVED",
  "ARCHIVED",
] as const;

export type SupportCaseStatus = (typeof SUPPORT_CASE_STATUSES)[number];

export const SUPPORT_CASE_PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;
export type SupportCasePriority = (typeof SUPPORT_CASE_PRIORITIES)[number];

export const SUPPORT_MESSAGE_SENDER_TYPES = [
  "MEMBER",
  "OWNER",
  "ADMIN",
  "SYSTEM",
] as const;
export type SupportMessageSenderType = (typeof SUPPORT_MESSAGE_SENDER_TYPES)[number];

export const SUPPORT_MESSAGE_TYPES = ["PUBLIC", "INTERNAL_NOTE"] as const;
export type SupportMessageType = (typeof SUPPORT_MESSAGE_TYPES)[number];

export type SupportCaseRow = {
  id: string;
  public_case_no: string;
  audience: "MEMBER" | "OWNER";
  requester_user_id: string;
  owner_store_id: string | null;
  category: string;
  subject: string;
  source_surface: string;
  reference_type: string | null;
  reference_id: string | null;
  status: SupportCaseStatus;
  priority: SupportCasePriority;
  assigned_admin_id: string | null;
  previous_case_id: string | null;
  requester_unread_count: number;
  admin_unread_count: number;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  first_admin_response_at: string | null;
  resolved_at: string | null;
  archived_at: string | null;
};

export type SupportMessageRow = {
  id: string;
  case_id: string;
  sender_type: SupportMessageSenderType;
  sender_user_id: string | null;
  sender_admin_id: string | null;
  message_type: SupportMessageType;
  body: string;
  created_at: string;
};

export type SupportSessionRow = {
  id: string;
  case_id: string;
  requester_user_id: string;
  opened_at: string;
  last_seen_at: string;
  closed_at: string | null;
};

export const ACTIVE_SUPPORT_CASE_STATUSES: ReadonlySet<SupportCaseStatus> = new Set([
  "OPEN",
  "WAITING_ADMIN",
  "WAITING_USER",
]);

export function buildSupportCaseRoute(caseId: string): string {
  return `/support/cases/${encodeURIComponent(caseId.trim())}`;
}

export function buildAdminSupportCaseRoute(caseId: string): string {
  return `/admin/support/${encodeURIComponent(caseId.trim())}`;
}
