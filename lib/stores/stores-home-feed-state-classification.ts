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

/**
 * Render: emptyFallback only when not in blocking pending and no rows/slots.
 * DSC-06 — `loadFailed`(마지막 home-feed 가 non-2xx·네트워크 실패) 이면 빈 상태가 아니라 오류+재시도.
 */
export function storesHomeShouldRenderEmptyFallback(opts: {
  loading: boolean;
  storeCount: number;
  visibleSlotCount: number;
  loadFailed?: boolean;
}): boolean {
  const showBlockingPending = opts.loading && opts.storeCount === 0;
  if (showBlockingPending) return false;
  if (opts.loadFailed === true) return false;
  return opts.storeCount === 0 && opts.visibleSlotCount === 0;
}

/** DSC-06 — 표시할 행이 없고 마지막 로드가 실패했을 때만 오류 상태(재시도) */
export function storesHomeShouldRenderLoadError(opts: {
  loading: boolean;
  storeCount: number;
  visibleSlotCount: number;
  loadFailed: boolean;
}): boolean {
  if (!opts.loadFailed) return false;
  if (opts.loading && opts.storeCount === 0) return false;
  return opts.storeCount === 0 && opts.visibleSlotCount === 0;
}
