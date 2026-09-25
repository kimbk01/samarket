/**
 * Community feed — initial-load loading ownership across abort / deferred refetch.
 *
 * Cleanup must invalidate the in-flight token BEFORE abort so finally cannot
 * classify the gap as READY_EMPTY (posts=[] + loading=false).
 */

/** finally may clear loading only when this request still owns the initial-load token. */
export function communityInitialLoadFinallyClearsLoading(opts: {
  append: boolean;
  requestToken: number;
  currentToken: number;
}): boolean {
  if (opts.append) return false;
  return opts.requestToken === opts.currentToken;
}

/** Empty CTA only when not loading and no error — PENDING holds loading=true. */
export function communityFeedShouldShowEmptyCta(opts: {
  hasError: boolean;
  loading: boolean;
  postCount: number;
}): boolean {
  if (opts.hasError) return false;
  if (opts.loading) return false;
  return opts.postCount === 0;
}

/**
 * Cold miss / empty list about to schedule deferred fetch: hold PENDING now
 * (do not wait for whenAppShellReady macrotask to arm loading).
 */
export function communityFeedShouldHoldPendingBeforeDeferredFetch(opts: {
  hasRenderableRows: boolean;
}): boolean {
  return !opts.hasRenderableRows;
}
