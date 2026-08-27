/**
 * Member ↔ Admin note threads — product helpers (Inquiry / Inbox).
 * Inquiry: started_by=member · Inbox: started_by=admin (Admin → one member).
 */

export type MemberAdminNoteSenderRole = "member" | "admin";

export type MemberAdminNoteThreadStatus = "open" | "answered" | "closed";

export type MemberAdminNoteStartedBy = "member" | "admin";

export type MemberAdminNoteKind = "inquiry" | "inbox";

export function kindFromStartedBy(startedBy: string | null | undefined): MemberAdminNoteKind {
  return String(startedBy ?? "member").trim() === "admin" ? "inbox" : "inquiry";
}

export function startedByFromKind(kind: MemberAdminNoteKind): MemberAdminNoteStartedBy {
  return kind === "inbox" ? "admin" : "member";
}

export function buildMemberAdminNoteRoute(
  threadId: string,
  startedBy?: string | null
): string {
  const id = threadId.trim();
  const kind = kindFromStartedBy(startedBy);
  const base = kind === "inbox" ? "/mypage/inbox" : "/mypage/inquiries";
  return `${base}/${encodeURIComponent(id)}`;
}

/**
 * Owner Care landing for the same member_admin_note thread authority.
 * Member canonical path remains `/mypage/...` (Customer Communication HARD LOCK).
 */
export function buildOwnerCareAdminNoteRoute(
  threadId: string,
  startedBy?: string | null,
  storeId?: string | null
): string {
  const id = threadId.trim();
  const kind = kindFromStartedBy(startedBy);
  const path =
    kind === "inbox"
      ? `/stores/owner/customer-care/messages/${encodeURIComponent(id)}`
      : `/stores/owner/customer-care/inquiries/${encodeURIComponent(id)}`;
  const sid = (storeId ?? "").trim();
  const withStore = sid
    ? `${path}${path.includes("?") ? "&" : "?"}storeId=${encodeURIComponent(sid)}`
    : path;
  return `${withStore}${withStore.includes("?") ? "&" : "?"}from=owner-care`;
}

export function buildMemberAdminNoteNotificationPayload(input: {
  threadId: string;
  subject: string;
  bodyPreview: string;
  startedBy?: string | null;
  /** When set, notification deep-links into Owner Customer Care (store owner session). */
  ownerStoreId?: string | null;
}): Record<string, unknown> {
  const startedBy = input.startedBy ?? "member";
  const ownerStoreId = (input.ownerStoreId ?? "").trim();
  const routeUrl = ownerStoreId
    ? buildOwnerCareAdminNoteRoute(input.threadId, startedBy, ownerStoreId)
    : buildMemberAdminNoteRoute(input.threadId, startedBy);
  return {
    routeUrl,
    noteThreadId: input.threadId.trim(),
    startedBy,
    previewKind: "member_admin_note",
    supportKind: kindFromStartedBy(startedBy) === "inbox" ? "direct_message" : "inquiry",
    subject: input.subject,
    bodyPreview: input.bodyPreview.slice(0, 200),
    ...(ownerStoreId ? { ownerStoreId, ownerCareRoute: true } : {}),
  };
}
