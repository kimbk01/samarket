/**
 * Stores HOME feed — loading vs empty ownership (STATE CLASSIFICATION).
 *
 * INFLIGHT / UNRESOLVED ≠ READY_EMPTY.
 * Empty copy is allowed only after authoritative home-feed has settled with 0 stores.
 */

/** Seed path: empty snapshot must stay PENDING until loadFeed settles (inflight or not). */
export function storesHomeEmptySnapKeepsPendingLoading(_hasInflight: boolean): true {
  return true;
}

/**
 * Network join path: with nothing displayable, keep PENDING even when joining
 * an existing single-flight (do not treat inflight as settled empty).
 */
export function storesHomeShouldArmPendingLoading(opts: {
  silent: boolean;
  hasDisplayableStores: boolean;
}): boolean {
  return !opts.silent && !opts.hasDisplayableStores;
}

/** Render: emptyFallback only when not in blocking pending and no rows/slots. */
export function storesHomeShouldRenderEmptyFallback(opts: {
  loading: boolean;
  storeCount: number;
  visibleSlotCount: number;
}): boolean {
  const showBlockingPending = opts.loading && opts.storeCount === 0;
  if (showBlockingPending) return false;
  return opts.storeCount === 0 && opts.visibleSlotCount === 0;
}
