/**
 * 실기 v6 FAIL 4 (Owner 「설계안대로 진행」 2026-11-07 · docs/audit/ads-v6-device-fail-design-2026-11-07.md)
 * 운영: 판매 중 글 4개 + 샘플 — 휴대폰 2열은 4번째 글 뒤 광고, 태블릿 3열은 광고 0 이었다.
 * 규칙: 간격(4~6)은 실제 글로만 센다 · 광고는 줄이 끝나는 자리에만 · 실제 글 뒤 샘플 묶음이 줄을 끝내면 거기.
 */
import { describe, expect, it, vi } from "vitest";

const gapRef = vi.hoisted(() => ({ gap: 4 }));
vi.mock("@/lib/ads/feed-ad-slot-policy", async (orig) => {
  const real = await orig<typeof import("@/lib/ads/feed-ad-slot-policy")>();
  return { ...real, feedAdGapForSlotOrdinal: () => gapRef.gap };
});

import { planTradeGridFeedAds, type TradeGridPostRow } from "@/lib/trade/marketplace/plan-trade-grid-feed-ads";

/** 운영 재현: 글 4개 · 4번째 글 뒤 끼운 샘플 1개(TRADE_SHOWCASE_EVERY_REAL = 4) · 목록 끝 샘플 n개 */
const fourPosts = (): TradeGridPostRow[] => [
  { cellsBefore: 0, dividerBefore: false, cellsAfter: 0 },
  { cellsBefore: 0, dividerBefore: false, cellsAfter: 0 },
  { cellsBefore: 0, dividerBefore: false, cellsAfter: 0 },
  { cellsBefore: 0, dividerBefore: false, cellsAfter: 1 },
];

/** 그리는 순서대로 칸을 세며 광고 자리의 칸 위치를 모은다 (끝 샘플까지) */
function adColumns(rows: TradeGridPostRow[], cols: number, trailing: number) {
  const plan = planTradeGridFeedAds(rows, "seed", cols, trailing);
  let col = 0;
  const at: number[] = [];
  const ad = () => {
    at.push(col);
    col = 0;
  };
  rows.forEach((r, i) => {
    for (let k = 1; k <= r.cellsBefore; k += 1) {
      col = (col + 1) % cols;
      if (plan.inCellsBeforeByIndex.get(i)?.afterCells === k) ad();
    }
    if (r.dividerBefore) col = 0;
    col = (col + 1) % cols;
    if (plan.injectAfterIndex.has(i)) ad();
    for (let k = 1; k <= r.cellsAfter; k += 1) {
      col = (col + 1) % cols;
      if (plan.inCellsAfterByIndex.get(i)?.afterCells === k) ad();
    }
  });
  for (let k = 1; k <= trailing; k += 1) {
    col = (col + 1) % cols;
    if (plan.trailing?.afterCells === k) ad();
  }
  return { plan, at };
}

describe("v6 FAIL 4 — 실제 글 4개 + 샘플", () => {
  it("태블릿 3열 · 끝 샘플 11 → 광고 1개, 줄 끝(칸 0)", () => {
    const { at } = adColumns(fourPosts(), 3, 11);
    expect(at).toEqual([0]);
  });

  it("휴대폰 2열 · 같은 입력 → 지금과 같은 자리(4번째 글 뒤) · 샘플 안 광고 없음", () => {
    const { plan, at } = adColumns(fourPosts(), 2, 11);
    expect([...plan.injectAfterIndex]).toEqual([3]);
    expect(plan.trailing).toBeNull();
    expect(plan.inCellsAfterByIndex.size).toBe(0);
    expect(at).toEqual([0]);
  });

  it("와이드 4열 → 광고 1개 (4번째 글이 줄 끝)", () => {
    const { plan, at } = adColumns(fourPosts(), 4, 11);
    expect([...plan.injectAfterIndex]).toEqual([3]);
    expect(at).toEqual([0]);
  });

  it("실제 글 3개 → 광고 0 (샘플은 간격을 채우지 않음)", () => {
    const { at } = adColumns(fourPosts().slice(0, 3), 3, 20);
    expect(at).toEqual([]);
  });

  it("목록이 아직 끝나지 않음(끝 샘플 0) → 샘플 자리에 광고를 미리 넣지 않음", () => {
    const { plan } = adColumns(fourPosts(), 3, 0);
    expect(plan.trailing).toBeNull();
    expect(plan.inCellsAfterByIndex.size).toBe(0);
    expect(plan.injectAfterIndex.size).toBe(0);
  });

  it("판매완료 앞 남은 샘플 묶음이 줄을 끝내면 그 안에 광고 1개", () => {
    const rows: TradeGridPostRow[] = [
      ...fourPosts().map((r) => ({ ...r, cellsAfter: 0 })),
      { cellsBefore: 5, dividerBefore: true, cellsAfter: 0 },
    ];
    const { plan, at } = adColumns(rows, 3, 0);
    expect(plan.inCellsBeforeByIndex.get(4)?.afterCells).toBe(2);
    expect(at).toEqual([0]);
  });

  it("샘플만 많아도 광고는 묶음당 1개", () => {
    const { at } = adColumns(fourPosts(), 3, 60);
    expect(at.length).toBe(1);
  });
});
