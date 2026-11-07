import { FEED_AD_SLOT_GAP_MIN, feedAdGapForSlotOrdinal, type FeedAdSlotPlan } from "@/lib/ads/feed-ad-slot-policy";

/**
 * F3 (Owner 2026-11-03 「F3·F6 구현」): 거래 격자 광고 줄을 **화면 칸 위치** 기준으로 정한다.
 *
 * 광고(2칸 전체 한 줄)는 글 번호만 세면 줄 중간에 들어갈 수 있다 — 같은 격자에 샘플 카드(1칸)·구분 줄(전체)이 끼어
 * 왼쪽/오른쪽이 밀리기 때문이다. 여기서는 목록이 실제로 그리는 순서를 그대로 따라가며 칸 위치를 세고,
 * 「글이 줄을 끝낸 자리」에서만 광고를 넣는다. 간격(4~6)은 기존 시드(`feedAdGapForSlotOrdinal`) 그대로다.
 *
 * 그리는 순서(홈·카테고리 공통): [남은 샘플(1칸 × n)] → [구분 줄(전체)] → 글(1칸) → [광고(전체)] → [끼운 샘플(1칸)]
 *   … 마지막 글 뒤 → [끝 샘플(1칸 × n) — 목록을 끝까지 받았고 판매완료 글이 없을 때]
 *
 * 실기 v6 FAIL 4 (Owner 「설계안대로 진행」 2026-11-07 · `docs/audit/ads-v6-device-fail-design-2026-11-07.md`):
 * 실제 글이 간격을 채웠는데 실제 글이 줄을 끝내지 못한 채 **샘플 묶음**(판매완료 앞 남은 샘플 · 목록 끝 샘플)이
 * 이어지면, 그 샘플이 줄을 끝내는 첫 자리에 광고를 넣는다(태블릿 3열 · 실제 글 4개 → 광고 0 이던 결함).
 * 간격은 여전히 **실제 글 수**로만 센다 — 샘플만 많은 화면에 광고가 늘지 않는다. 글 사이 자리 규칙은 그대로다.
 */
export type TradeGridPostRow = {
  /** 이 글 앞에 그리는 1칸 항목 수 (판매완료 앞 남은 샘플) */
  cellsBefore: number;
  /** 이 글 앞에 2칸 전체 구분 줄이 있는지 */
  dividerBefore: boolean;
  /** 이 글(과 광고) 뒤에 그리는 1칸 항목 수 (끼운 샘플) */
  cellsAfter: number;
};

/** 샘플 묶음 안 광고 자리 — 샘플 `afterCells` 개를 그린 바로 뒤 */
export type TradeGridSampleAdSlot = { afterCells: number; slotOrdinal: number };

export type TradeGridFeedAdPlan = FeedAdSlotPlan & {
  /** 글 index 앞 샘플 묶음(`cellsBefore`) 안 광고 자리 */
  inCellsBeforeByIndex: ReadonlyMap<number, TradeGridSampleAdSlot>;
  /** 목록 끝(끝 샘플이 있을 때) 마지막 글 뒤 끼운 샘플(`cellsAfter`) 안 광고 자리 — 그 글 index */
  inCellsAfterByIndex: ReadonlyMap<number, TradeGridSampleAdSlot>;
  /** 마지막 글 뒤 끝 샘플(`trailingCells`) 안 광고 자리 */
  trailing: TradeGridSampleAdSlot | null;
};

export function planTradeGridFeedAds(
  rows: readonly TradeGridPostRow[],
  seed: string,
  columnCount: number,
  /** 마지막 글 뒤에 그리는 끝 샘플 수 (목록을 끝까지 받았고 판매완료 글이 없을 때만 > 0) */
  trailingCells = 0
): TradeGridFeedAdPlan {
  const cols = Math.max(1, Math.floor(columnCount));
  const injectAfterIndex = new Set<number>();
  const slotOrdinalByContentIndex = new Map<number, number>();
  const inCellsBeforeByIndex = new Map<number, TradeGridSampleAdSlot>();
  const inCellsAfterByIndex = new Map<number, TradeGridSampleAdSlot>();
  if (rows.length < FEED_AD_SLOT_GAP_MIN) {
    return { injectAfterIndex, slotOrdinalByContentIndex, inCellsBeforeByIndex, inCellsAfterByIndex, trailing: null };
  }

  let col = 0;
  let ordinal = 0;
  let postsSinceAd = 0;
  let gap = feedAdGapForSlotOrdinal(seed, ordinal);
  const addCells = (n: number) => {
    col = (col + Math.max(0, Math.floor(n))) % cols;
  };
  const takeSlot = (): number => {
    const o = ordinal;
    ordinal += 1;
    postsSinceAd = 0;
    gap = feedAdGapForSlotOrdinal(seed, ordinal);
    return o;
  };
  /** 샘플 묶음을 1칸씩 그리며, 간격을 채운 상태로 줄이 끝나는 첫 자리를 찾는다 (샘플은 간격을 채우지 않으므로 묶음 안 광고는 최대 1개) */
  const walkSampleRun = (n: number): TradeGridSampleAdSlot | null => {
    const count = Math.max(0, Math.floor(n));
    let slot: TradeGridSampleAdSlot | null = null;
    for (let k = 1; k <= count; k += 1) {
      col = (col + 1) % cols;
      if (!slot && col === 0 && postsSinceAd >= gap && ordinal <= 500) {
        slot = { afterCells: k, slotOrdinal: takeSlot() };
      }
    }
    return slot;
  };

  rows.forEach((row, index) => {
    const before = walkSampleRun(row.cellsBefore);
    if (before) inCellsBeforeByIndex.set(index, before);
    if (row.dividerBefore) col = 0;
    addCells(1);
    postsSinceAd += 1;
    if (col === 0 && postsSinceAd >= gap && ordinal <= 500) {
      injectAfterIndex.add(index);
      slotOrdinalByContentIndex.set(index, takeSlot());
    }
    // 목록 끝: 마지막 글 뒤 끼운 샘플부터 끝 샘플까지 한 샘플 묶음이다 (더 불러올 글이 없어 자리가 바뀌지 않음)
    if (index === rows.length - 1 && trailingCells > 0) {
      const after = walkSampleRun(row.cellsAfter);
      if (after) inCellsAfterByIndex.set(index, after);
    } else {
      addCells(row.cellsAfter);
    }
  });
  const trailing = walkSampleRun(trailingCells);
  return { injectAfterIndex, slotOrdinalByContentIndex, inCellsBeforeByIndex, inCellsAfterByIndex, trailing };
}
