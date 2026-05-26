import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";

/** 1단 종 인박스 — 배지는 목록과 동일 필터 기준으로 맞춘다. */
export function computeTier1HeaderInboxDisplayUnread(opts: {
  storeUnread: number | null;
  rowUnread: number;
  listSynced: boolean;
  open: boolean;
  loading: boolean;
}): number {
  const su = opts.storeUnread ?? 0;
  if (opts.listSynced) {
    return opts.rowUnread;
  }
  if (opts.open && opts.loading) {
    return Math.max(su, opts.rowUnread);
  }
  return su;
}

export function syncTier1HeaderInboxUnreadFromRows(
  rows: { is_read: boolean }[],
  store: { reconcile: (count: number) => void } = myGeneralNotificationUnreadStore
): void {
  store.reconcile(rows.filter((r) => !r.is_read).length);
}
