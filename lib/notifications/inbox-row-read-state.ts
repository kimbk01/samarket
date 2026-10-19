/**
 * INAPP-01 — Notification Center / Bell row read-vs-unread presentation contract.
 *
 * Unread: tinted row background + leading dot + bold title.
 * Read:   plain surface, no dot, normal-weight title.
 * sam-* tokens only (no hex). Focus / selection tint is layered by the caller.
 */
export type InboxRowReadState = Readonly<{
  unread: boolean;
  /** `<li>` background when not focused / selected. */
  rowClassName: string;
  titleClassName: string;
  showUnreadDot: boolean;
  dotClassName: string;
}>;

export const INBOX_ROW_UNREAD_BG = "bg-sam-primary-soft";
export const INBOX_ROW_READ_BG = "bg-sam-surface";
export const INBOX_ROW_UNREAD_DOT = "h-2 w-2 shrink-0 rounded-full bg-sam-primary";

export function resolveInboxRowReadState(unreadCount: number | null | undefined): InboxRowReadState {
  const unread = Math.floor(Number(unreadCount) || 0) > 0;
  return {
    unread,
    rowClassName: unread ? INBOX_ROW_UNREAD_BG : INBOX_ROW_READ_BG,
    titleClassName: unread ? "font-bold text-sam-fg" : "font-normal text-sam-fg",
    showUnreadDot: unread,
    dotClassName: INBOX_ROW_UNREAD_DOT,
  };
}
