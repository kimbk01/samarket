import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";
import type { Tier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";

/** 1단 종 인박스 — targets unread store (non–tier1_inbox_bell surfaces). */
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

/**
 * B4 — Header Bell digit SSOT.
 * `tier1_inbox_bell`: notification-badge-count `total` only (events; adminNotice already inside).
 * Other surfaces: keep targets unread-badge-store path (Phase H: no full unread rewire).
 * DO NOT: add adminNotice supplement again on top of badge-count.total.
 */
export function resolveTier1HeaderBellBadgeTotal(opts: {
  surface: Tier1BellBadgeSurface;
  badgeCountTotal: number | null | undefined;
  storeUnread: number | null;
  rowUnread: number;
  listSynced: boolean;
  open: boolean;
  loading: boolean;
  supplementalUnreadCount?: number;
}): number {
  const supplemental = Math.max(0, Math.floor(Number(opts.supplementalUnreadCount) || 0));
  if (opts.surface === "tier1_inbox_bell") {
    const total = Math.max(0, Math.floor(Number(opts.badgeCountTotal) || 0));
    return total + supplemental;
  }
  return (
    computeTier1HeaderInboxDisplayUnread({
      storeUnread: opts.storeUnread,
      rowUnread: opts.rowUnread,
      listSynced: opts.listSynced,
      open: opts.open,
      loading: opts.loading,
    }) + supplemental
  );
}

/** @deprecated partial list로 store count 덮어쓰지 않음 — mark read/delete 후 store.refresh() 사용 */
export function syncTier1HeaderInboxUnreadFromRows(
  _rows: { is_read: boolean }[],
  _store: { reconcile: (count: number) => void } = myGeneralNotificationUnreadStore
): void {
  /* no-op: tier1 badge follows GET unread_count only */
}
