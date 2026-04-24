/**
 * 티어1(헤더) 드롭다운용 — 유형별로 합쳐 한 줄 요약(미읽음/전체)만 쓴다.
 */
export type InboxRowForAggregate = {
  notification_type: string;
  is_read: boolean;
  created_at: string;
};

export type InboxTypeSummary = {
  notificationType: string;
  total: number;
  unread: number;
  /** 해당 유형 가장 최근 `created_at` (정렬용) */
  latestAt: string;
};

export function aggregateInboxByType(rows: InboxRowForAggregate[]): InboxTypeSummary[] {
  const map = new Map<string, InboxTypeSummary>();
  for (const r of rows) {
    const t = (r.notification_type || "other").trim() || "other";
    const cur = map.get(t) ?? {
      notificationType: t,
      total: 0,
      unread: 0,
      latestAt: r.created_at,
    };
    cur.total += 1;
    if (!r.is_read) cur.unread += 1;
    if (r.created_at > cur.latestAt) cur.latestAt = r.created_at;
    map.set(t, cur);
  }
  return Array.from(map.values()).sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
}

export function countUnread(rows: InboxRowForAggregate[]): number {
  return rows.filter((r) => !r.is_read).length;
}

export function typeShortcutHref(notificationType: string): string {
  switch (notificationType) {
    case "chat":
      return "/community-messenger?section=chats&kind=trade";
    case "commerce":
      return "/my/store-orders";
    default:
      return "/mypage/notifications#notification-inbox";
  }
}
