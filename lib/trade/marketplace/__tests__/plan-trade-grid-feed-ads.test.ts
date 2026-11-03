import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEED_AD_SLOT_GAP_MAX, FEED_AD_SLOT_GAP_MIN } from "@/lib/ads/feed-ad-slot-policy";
import { planTradeGridFeedAds, type TradeGridPostRow } from "@/lib/trade/marketplace/plan-trade-grid-feed-ads";
import { readGridColumnCount } from "@/lib/trade/marketplace/use-grid-column-count";

const plain = (n: number): TradeGridPostRow[] =>
  Array.from({ length: n }, () => ({ cellsBefore: 0, dividerBefore: false, cellsAfter: 0 }));

/** 목록과 같은 순서로 그려 보고, 광고(전체 한 줄)가 들어갈 때 칸 위치를 모은다 */
function simulate(rows: readonly TradeGridPostRow[], inject: ReadonlySet<number>, cols: number) {
  let col = 0;
  const adCols: number[] = [];
  const postsBetween: number[] = [];
  let since = 0;
  rows.forEach((r, i) => {
    col = (col + r.cellsBefore) % cols;
    if (r.dividerBefore) col = 0;
    col = (col + 1) % cols;
    since += 1;
    if (inject.has(i)) {
      adCols.push(col);
      postsBetween.push(since);
      since = 0;
      col = 0;
    }
    col = (col + r.cellsAfter) % cols;
  });
  return { adCols, postsBetween };
}

const SEEDS = ["trade:home|s1", "trade:home|s2", "trade:category:abc|s3", "x|y", "seed-42"];

describe("F3 planTradeGridFeedAds — 광고 줄은 칸 위치 0 에만", () => {
  it.each([2, 3, 4])("샘플 끼움(실제 글 4개마다) · %i열 — 줄 중간 광고 0, 간격 ≥ 4", (cols) => {
    const rows = plain(60).map((r, i) => ({ ...r, cellsAfter: (i + 1) % 4 === 0 ? 1 : 0 }));
    for (const seed of SEEDS) {
      const plan = planTradeGridFeedAds(rows, seed, cols);
      const { adCols, postsBetween } = simulate(rows, plan.injectAfterIndex, cols);
      expect(adCols.length).toBeGreaterThan(0);
      expect(adCols.every((c) => c === 0)).toBe(true);
      expect(postsBetween.every((n) => n >= FEED_AD_SLOT_GAP_MIN)).toBe(true);
    }
  });

  it("설계 문서 재현 사례(2열·샘플) — 예전 방식은 줄 중간, 새 방식은 0", () => {
    const rows = plain(20).map((r, i) => ({ ...r, cellsAfter: (i + 1) % 4 === 0 ? 1 : 0 }));
    const oldInject = new Set([3, 7, 11, 15, 19]);
    expect(simulate(rows, oldInject, 2).adCols.some((c) => c !== 0)).toBe(true);
    const plan = planTradeGridFeedAds(rows, "doc-case", 2);
    expect(simulate(rows, plan.injectAfterIndex, 2).adCols.every((c) => c === 0)).toBe(true);
  });

  it("구분 줄이 홀수 번째 글 뒤에 와도 · 남은 샘플이 판매완료 앞에 끼어도 0", () => {
    const rows = plain(40).map((r, i) => ({
      ...r,
      dividerBefore: i === 17,
      cellsBefore: i === 17 ? 3 : 0,
    }));
    for (const seed of SEEDS) {
      for (const cols of [2, 3, 4]) {
        const plan = planTradeGridFeedAds(rows, seed, cols);
        expect(simulate(rows, plan.injectAfterIndex, cols).adCols.every((c) => c === 0)).toBe(true);
      }
    }
  });

  it("2열·끼움 없음 — 간격 4~6 유지(짝수로 올림), 같은 시드는 같은 위치", () => {
    for (const seed of SEEDS) {
      const plan = planTradeGridFeedAds(plain(80), seed, 2);
      const { postsBetween } = simulate(plain(80), plan.injectAfterIndex, 2);
      expect(postsBetween.every((n) => n >= FEED_AD_SLOT_GAP_MIN && n <= FEED_AD_SLOT_GAP_MAX)).toBe(true);
      expect([...planTradeGridFeedAds(plain(80), seed, 2).injectAfterIndex]).toEqual([...plan.injectAfterIndex]);
    }
  });

  it("앞쪽 광고 위치는 글이 더 불러와져도 그대로 · 순번 0,1,2…", () => {
    const short = planTradeGridFeedAds(plain(30), "grow", 2);
    const long = planTradeGridFeedAds(plain(90), "grow", 2);
    for (const i of short.injectAfterIndex) expect(long.injectAfterIndex.has(i)).toBe(true);
    expect([...long.slotOrdinalByContentIndex.values()]).toEqual([...long.slotOrdinalByContentIndex.values()].map((_, k) => k));
  });

  it("글 4개 미만은 광고 없음", () => {
    expect(planTradeGridFeedAds(plain(3), "few", 2).injectAfterIndex.size).toBe(0);
  });
});

describe("F3 readGridColumnCount", () => {
  it("계산값 열 수", () => {
    expect(readGridColumnCount("170px 170px")).toBe(2);
    expect(readGridColumnCount("200px 200px 200px")).toBe(3);
    expect(readGridColumnCount("none")).toBeNull();
    expect(readGridColumnCount("")).toBeNull();
  });
});

describe("F3 홈·카테고리 연결", () => {
  it.each(["components/home/HomeProductList.tsx", "components/post/PostListByCategory.tsx"])("%s 는 칸 위치 계산만 쓴다", (f) => {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    expect(src).toContain("planTradeGridFeedAds(");
    expect(src).toContain("useGridColumnCount(");
    expect(src).not.toContain("planFeedAdSlots(");
  });
});
