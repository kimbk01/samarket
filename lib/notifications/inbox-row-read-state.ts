/**
 * INAPP-01 — Notification Center / Bell row read-vs-unread presentation contract.
 *
 * Unread: tinted row background + left accent bar + leading dot + bold title.
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

/** U-01 — 미읽음 = 연녹 배경 + 좌측 3px 브랜드 바 (선택 상태 = 흰 배경 + 테두리와 구분) */
export const INBOX_ROW_UNREAD_BG =
  "relative bg-sam-primary-soft before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-sam-primary";
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
