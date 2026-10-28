import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Owner 2026-10-28 — 판매완료 카드는 보이기만(누를 수 없음), 사진 가운데 「판매완료」, 배지 글자 가운데 */
describe("sold listing card + badge centering", () => {
  const root = path.resolve(__dirname, "../../..");
  const card = readFileSync(path.join(root, "components/post/PostCard.tsx"), "utf8");
  const badge = readFileSync(path.join(root, "components/trade/TradeTopicBadge.tsx"), "utf8");

  it("판매완료 카드는 상세로 가지 않고 하트·⋮ 를 숨긴다(찜 목록만 하트 유지)", () => {
    expect(card).toContain("aria-disabled={isSoldOrClosed || undefined}");
    expect(card).toContain('isSoldOrClosed ? "pointer-events-none select-none" : ""');
    expect(card).toContain("!isSoldOrClosed || soldKeepsFavoriteToggle");
    expect(card).toContain('data-trade-card-status="sold"');
    expect(card).toContain("absolute inset-0 z-[2] flex items-center justify-center");
    const fav = readFileSync(path.join(root, "components/favorites/FavoritePostCard.tsx"), "utf8");
    expect(fav).toContain("soldKeepsFavoriteToggle");
  });

  it("주제 배지는 높이 고정 + 가운데 정렬", () => {
    expect(badge).toContain("inline-flex h-5 max-w-full items-center justify-center");
  });
});
