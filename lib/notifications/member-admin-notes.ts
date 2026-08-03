/**
 * Member ↔ Admin note threads — product helpers (not store platform inquiries).
 */
export type MemberAdminNoteSenderRole = "member" | "admin";

export type MemberAdminNoteThreadStatus = "open" | "answered" | "closed";

export function buildMemberAdminNoteRoute(threadId: string): string {
  const id = threadId.trim();
  return `/notifications/notes/${encodeURIComponent(id)}`;
}

export function buildMemberAdminNoteNotificationPayload(input: {
  threadId: string;
  subject: string;
  bodyPreview: string;
}): Record<string, unknown> {
  const routeUrl = buildMemberAdminNoteRoute(input.threadId);
  return {
    routeUrl,
    campaignType: "system",
    noteThreadId: input.threadId.trim(),
    previewKind: "member_admin_note",
    subject: input.subject,
    bodyPreview: input.bodyPreview.slice(0, 200),
  };
}
