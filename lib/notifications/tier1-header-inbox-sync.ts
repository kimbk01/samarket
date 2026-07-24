import type { Tier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";

/**
 * Header Bell digit SSOT — Domain projection `badge-count.total` only
 * (= unreadApprovedNotificationEvents / Bell Contract B).
 * All routes / surfaces show the same Bell total.
 * DO NOT: storeUnread, rowUnread, supplementalUnreadCount, domain room sum, adminNotice re-add.
 *
 * Phase J1 removed legacy row-sync / display-unread helpers (import-ban: verify:badge-import-ban).
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
