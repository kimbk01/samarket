/**
 * FB-C07 · D-23 (Owner 「설계안대로 구현」 2026-11-04) — 샘플 카드(1칸)가 섞여도 규칙이 지켜지는지 표 시험.
 * 규칙(HL 계약 정정): 광고는 앞 광고 뒤 글이 gap(4~6)개 이상 쌓인 뒤 **줄이 끝나는 첫 자리**(줄 첫 칸)에 들어간다.
 * 표: 샘플 0·1·2개(가능한 모든 위치) × gap 4·5·6 × 글 30개 · 2칸 격자.
 * 코드는 그대로 두고 확인만 한다(규칙과 다른 위치가 나오면 고치지 않고 보고).
 */
import { describe, expect, it, vi } from "vitest";

const gapRef = vi.hoisted(() => ({ gap: 4 }));
vi.mock("@/lib/ads/feed-ad-slot-policy", async (orig) => {
  const real = await orig<typeof import("@/lib/ads/feed-ad-slot-policy")>();
  return { ...real, feedAdGapForSlotOrdinal: () => gapRef.gap };
});

import { planTradeGridFeedAds, type TradeGridPostRow } from "@/lib/trade/marketplace/plan-trade-grid-feed-ads";

const POSTS = 30;
const COLS = 2;

/** 목록이 그리는 순서 그대로 칸을 세며, 광고가 들어가는 칸 위치와 광고 사이 글 수를 모은다 */
function simulate(rows: readonly TradeGridPostRow[], inject: ReadonlySet<number>) {
  let col = 0;
  let since = 0;
  const adCols: number[] = [];
  const postsBetween: number[] = [];
  rows.forEach((r, i) => {
    col = (col + r.cellsBefore) % COLS;
    if (r.dividerBefore) col = 0;
    col = (col + 1) % COLS;
    since += 1;
    if (inject.has(i)) {
      adCols.push(col);
      postsBetween.push(since);
      since = 0;
      col = 0;
    }
    col = (col + r.cellsAfter) % COLS;
  });
  return { adCols, postsBetween };
}

/** 앞 광고 뒤 gap 개를 채운 뒤, 광고 자리보다 먼저 「글이 줄을 끝낸 자리」가 있었는지 */
function skippedEarlierRowEnd(rows: readonly TradeGridPostRow[], inject: ReadonlySet<number>, gap: number): boolean {
  let col = 0;
  let since = 0;
  let eligibleSeen = false;
  let skipped = false;
  rows.forEach((r, i) => {
    col = (col + r.cellsBefore) % COLS;
    if (r.dividerBefore) col = 0;
    col = (col + 1) % COLS;
    since += 1;
    const eligible = col === 0 && since >= gap;
    if (inject.has(i)) {
      if (eligibleSeen) skipped = true;
      since = 0;
      col = 0;
      eligibleSeen = false;
    } else if (eligible) {
      eligibleSeen = true;
    }
    col = (col + r.cellsAfter) % COLS;
  });
  return skipped;
}

function rowsWithSamplesAfter(positions: readonly number[]): TradeGridPostRow[] {
  return Array.from({ length: POSTS }, (_, i) => ({
    cellsBefore: 0,
    dividerBefore: false,
    cellsAfter: positions.filter((p) => p === i).length,
  }));
}

function sampleLayouts(count: 0 | 1 | 2): number[][] {
  if (count === 0) return [[]];
  if (count === 1) return Array.from({ length: POSTS }, (_, i) => [i]);
  const out: number[][] = [];
  for (let a = 0; a < POSTS; a += 1) for (let b = a; b < POSTS; b += 1) out.push([a, b]);
  return out;
}

/** 기록용: 경우별 광고 사이 최대 글 수 (보고에 쓴다 · 규칙 판정에는 쓰지 않음) */
const maxBetweenByCase = new Map<string, number>();

describe("FB-C07 · D-23 샘플 섞임 표 — 광고는 모두 줄 첫 칸 · 앞 광고 뒤 글 수 ≥ gap", () => {
  const cases: Array<[0 | 1 | 2, number]> = [];
  for (const samples of [0, 1, 2] as const) for (const gap of [4, 5, 6]) cases.push([samples, gap]);

  it.each(cases)("샘플 %i개 × gap %i × 글 30", (samples, gap) => {
    gapRef.gap = gap;
    let maxBetween = 0;
    for (const layout of sampleLayouts(samples)) {
      const rows = rowsWithSamplesAfter(layout);
      const plan = planTradeGridFeedAds(rows, `table|${samples}|${gap}`, COLS);
      const { adCols, postsBetween } = simulate(rows, plan.injectAfterIndex);
      expect(adCols.length, `layout ${layout.join(",")}`).toBeGreaterThan(0);
      // 모든 광고가 줄 첫 칸 (광고 직전 칸 위치 0 = 줄이 끝난 자리)
      expect(adCols.every((c) => c === 0), `layout ${layout.join(",")}`).toBe(true);
      // 앞 광고 뒤 글 수 ≥ gap
      expect(postsBetween.every((n) => n >= gap), `layout ${layout.join(",")}`).toBe(true);
      // 순번은 0,1,2… 로 이어진다
      expect([...plan.slotOrdinalByContentIndex.values()]).toEqual(postsBetween.map((_, k) => k));
      // 「첫 자리」: gap 을 채운 뒤 글이 줄을 끝낸 더 이른 자리를 건너뛰지 않는다
      expect(skippedEarlierRowEnd(rows, plan.injectAfterIndex, gap), `layout ${layout.join(",")}`).toBe(false);
      maxBetween = Math.max(maxBetween, ...postsBetween);
    }
    maxBetweenByCase.set(`${samples}x${gap}`, maxBetween);
    if (process.env.FB_C07_TABLE) console.log(`samples=${samples} gap=${gap} maxPostsBetween=${maxBetween}`);
  });
});
