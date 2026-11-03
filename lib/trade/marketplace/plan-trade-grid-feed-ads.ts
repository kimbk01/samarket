import { FEED_AD_SLOT_GAP_MIN, feedAdGapForSlotOrdinal, type FeedAdSlotPlan } from "@/lib/ads/feed-ad-slot-policy";

/**
 * F3 (Owner 2026-11-03 「F3·F6 구현」): 거래 격자 광고 줄을 **화면 칸 위치** 기준으로 정한다.
 *
 * 광고(2칸 전체 한 줄)는 글 번호만 세면 줄 중간에 들어갈 수 있다 — 같은 격자에 샘플 카드(1칸)·구분 줄(전체)이 끼어
 * 왼쪽/오른쪽이 밀리기 때문이다. 여기서는 목록이 실제로 그리는 순서를 그대로 따라가며 칸 위치를 세고,
 * 「글이 줄을 끝낸 자리」에서만 광고를 넣는다. 간격(4~6)은 기존 시드(`feedAdGapForSlotOrdinal`) 그대로다.
 *
 * 그리는 순서(홈·카테고리 공통): [남은 샘플(1칸 × n)] → [구분 줄(전체)] → 글(1칸) → [광고(전체)] → [끼운 샘플(1칸)]
 */
export type TradeGridPostRow = {
  /** 이 글 앞에 그리는 1칸 항목 수 (판매완료 앞 남은 샘플) */
  cellsBefore: number;
  /** 이 글 앞에 2칸 전체 구분 줄이 있는지 */
  dividerBefore: boolean;
  /** 이 글(과 광고) 뒤에 그리는 1칸 항목 수 (끼운 샘플) */
  cellsAfter: number;
};

export function planTradeGridFeedAds(
  rows: readonly TradeGridPostRow[],
  seed: string,
  columnCount: number
): FeedAdSlotPlan {
  const cols = Math.max(1, Math.floor(columnCount));
  const injectAfterIndex = new Set<number>();
  const slotOrdinalByContentIndex = new Map<number, number>();
  if (rows.length < FEED_AD_SLOT_GAP_MIN) return { injectAfterIndex, slotOrdinalByContentIndex };

  let col = 0;
  let ordinal = 0;
  let postsSinceAd = 0;
  let gap = feedAdGapForSlotOrdinal(seed, ordinal);
  const addCells = (n: number) => {
    col = (col + Math.max(0, Math.floor(n))) % cols;
  };

  rows.forEach((row, index) => {
    addCells(row.cellsBefore);
    if (row.dividerBefore) col = 0;
    addCells(1);
    postsSinceAd += 1;
    if (col === 0 && postsSinceAd >= gap && ordinal <= 500) {
      injectAfterIndex.add(index);
      slotOrdinalByContentIndex.set(index, ordinal);
      ordinal += 1;
      postsSinceAd = 0;
      gap = feedAdGapForSlotOrdinal(seed, ordinal);
    }
    addCells(row.cellsAfter);
  });
  return { injectAfterIndex, slotOrdinalByContentIndex };
}
