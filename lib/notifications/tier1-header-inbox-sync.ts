import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";

/** 1단 종 인박스 — 배지는 API unread store만 사용 (partial 목록 reconcile 금지). */
export function computeTier1HeaderInboxDisplayUnread(opts: {
  storeUnread: number | null;
  rowUnread: number;
  listSynced: boolean;
  open: boolean;
  loading: boolean;
}): number {
  const su = opts.storeUnread ?? 0;
  if (opts.open && opts.loading) {
    return Math.max(su, opts.rowUnread);
  }
  return su;
}

/** @deprecated partial list로 store count 덮어쓰지 않음 — mark read/delete 후 store.refresh() 사용 */
export function syncTier1HeaderInboxUnreadFromRows(
  _rows: { is_read: boolean }[],
  _store: { reconcile: (count: number) => void } = myGeneralNotificationUnreadStore
): void {
  /* no-op: tier1 badge follows GET unread_count only */
}
