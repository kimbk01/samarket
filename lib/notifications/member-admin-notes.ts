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

export function buildMemberAdminNoteNotificationPayload(input: {
  threadId: string;
  subject: string;
  bodyPreview: string;
  startedBy?: string | null;
}): Record<string, unknown> {
  const startedBy = input.startedBy ?? "member";
  const routeUrl = buildMemberAdminNoteRoute(input.threadId, startedBy);
  return {
    routeUrl,
    campaignType: "system",
    noteThreadId: input.threadId.trim(),
    startedBy,
    previewKind: "member_admin_note",
    subject: input.subject,
    bodyPreview: input.bodyPreview.slice(0, 200),
  };
}
