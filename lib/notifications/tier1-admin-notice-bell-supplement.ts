import type { Tier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";

/**
 * @deprecated Header Bell no longer re-adds adminNotice on top of projection total.
 * Kept for tests / diagnostics — always returns 0 for product digit.
 */
export function resolveTier1AdminNoticeBellSupplement(
  _surface: Tier1BellBadgeSurface
): number {
  void _surface;
  return 0;
}

/**
 * @deprecated Use `applyTier1InboxMarkAllReadOptimistic` (projection rebuild).
 * Returns false — direct store patch removed.
 */
export function clearTier1AdminNoticeBellSupplementOptimistic(): boolean {
  return false;
}
