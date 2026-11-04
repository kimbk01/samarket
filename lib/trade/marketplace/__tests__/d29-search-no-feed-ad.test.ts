/**
 * D-29 (2026-11-04) — 검색어가 있으면 거래 목록(홈·카테고리)에 피드 배너를 끼우지 않는다.
 * 목록 전체 렌더는 무거워 여기서는 끼우기 조건 줄만 본다(코드 구조 검사 · 렌더 시험 아님).
 * 거래 hot path(§9: getPostsForHome 단일 비행·prewarm 키)는 건드리지 않는다 — 조건은 그리기 단계에만 있다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("D-29 검색 중에는 피드 배너 0", () => {
  it.each([
    ["components/home/HomeProductList.tsx", "tradeHomeAdPlan"],
    ["components/post/PostListByCategory.tsx", "tradeCategoryAdPlan"],
  ])("%s", (file, plan) => {
    const src = read(file);
    expect(src).toContain(`{!q?.trim() && shouldInjectFeedAdAtContentIndex(index, ${plan}) ? (`);
    expect(src).toMatch(/const q = sanitizeMarketplaceQueryText\(searchParams\.get\("q"\)\) \?\? null;/);
  });
});
