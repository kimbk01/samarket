import type { Tier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";

/**
 * Header Bell digit SSOT — Domain projection `badge-count.total` only.
 * All routes / surfaces show the same Bell total.
 * DO NOT: storeUnread, rowUnread, supplementalUnreadCount, adminNotice re-add.
 */
export function resolveTier1HeaderBellBadgeTotal(opts: {
  surface: Tier1BellBadgeSurface;
  badgeCountTotal: number | null | undefined;
  storeUnread?: number | null;
  rowUnread?: number;
  listSynced?: boolean;
  open?: boolean;
  loading?: boolean;
  /** @deprecated Ignored — projection already includes orphan/non-chat. */
  supplementalUnreadCount?: number;
}): number {
  void opts.surface;
  void opts.storeUnread;
  void opts.rowUnread;
  void opts.listSynced;
  void opts.open;
  void opts.loading;
  void opts.supplementalUnreadCount;
  return Math.max(0, Math.floor(Number(opts.badgeCountTotal) || 0));
}

/** @deprecated Legacy targets-store display — Header Bell no longer uses this path. */
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
  _store?: { reconcile: (count: number) => void }
): void {
  /* no-op */
}
