/**
 * Feed Banner insertion cadence — deterministic gaps in [4, 6].
 *
 * PRODUCT (2026-08-10 community SSOT connect): posts ≈4–6 between banner slots.
 * Prior HARD LOCK [6,10] superseded for cadence only.
 * - Math.random() forbidden
 * - Content-row indices only (ads never enter DB pagination)
 * - Same surface+session seed → stable inject indices across rerender
 */

export const FEED_AD_SLOT_GAP_MIN = 4;
export const FEED_AD_SLOT_GAP_MAX = 6;

/** @deprecated Prefer FEED_AD_SLOT_GAP_* — kept for gradual call-site migration. */
export const FEED_AD_SLOT_AFTER_CONTENT_COUNT = FEED_AD_SLOT_GAP_MIN;

export function feedAdStableHash(input: string): number {
  let h = 2166136261;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function feedAdGapForSlotOrdinal(seed: string, slotOrdinal: number): number {
  const span = FEED_AD_SLOT_GAP_MAX - FEED_AD_SLOT_GAP_MIN + 1;
  const h = feedAdStableHash(`${seed}|gap|${slotOrdinal}`);
  return FEED_AD_SLOT_GAP_MIN + (h % span);
}

export type FeedAdSlotPlan = {
  /** 0-based content indices after which an ad injects. */
  injectAfterIndex: ReadonlySet<number>;
  /** contentIndex → slot ordinal (0,1,2…) */
  slotOrdinalByContentIndex: ReadonlyMap<number, number>;
};

/**
 * Build inject plan for the currently loaded content length.
 * Recomputing from the start with the same seed keeps early slots stable as pages grow.
 */
export function planFeedAdSlots(contentLength: number, seed: string): FeedAdSlotPlan {
  const injectAfterIndex = new Set<number>();
  const slotOrdinalByContentIndex = new Map<number, number>();
  if (contentLength < FEED_AD_SLOT_GAP_MIN) {
    return { injectAfterIndex, slotOrdinalByContentIndex };
  }
  let consumed = 0;
  let ordinal = 0;
  while (true) {
    const gap = feedAdGapForSlotOrdinal(seed, ordinal);
    consumed += gap;
    const index = consumed - 1;
    if (index >= contentLength) break;
    injectAfterIndex.add(index);
    slotOrdinalByContentIndex.set(index, ordinal);
    ordinal += 1;
    if (ordinal > 500) break;
  }
  return { injectAfterIndex, slotOrdinalByContentIndex };
}

export function shouldInjectFeedAdAtContentIndex(
  contentIndex: number,
  plan: FeedAdSlotPlan
): boolean {
  return plan.injectAfterIndex.has(contentIndex);
}

export function feedAdSlotSeed(input: {
  surfaceKey: string;
  feedSessionId: string;
}): string {
  return `${input.surfaceKey}|${input.feedSessionId}`;
}
