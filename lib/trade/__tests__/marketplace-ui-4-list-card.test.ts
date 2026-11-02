import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function slotIndex(haystack: string, slot: string): number {
  return haystack.indexOf(`data-ui4-slot="${slot}"`);
}

function assertInfoOrder(haystack: string) {
  const photos = slotIndex(haystack, "photos");
  const price = slotIndex(haystack, "price");
  const title = slotIndex(haystack, "title");
  const location = slotIndex(haystack, "location");
  expect(photos).toBeGreaterThan(-1);
  expect(price).toBeGreaterThan(photos);
  expect(title).toBeGreaterThan(price);
  expect(location).toBeGreaterThan(title);
}

describe("marketplace UI-4 LIST card information contract", () => {
  it("PostCard is photo → price → title → location without status/spec rows", () => {
    const card = src("components/post/PostCard.tsx");
    assertInfoOrder(card);
    expect(card).not.toContain("TradeListingStatusBadge");
    expect(card).not.toContain("formatTimeAgo");
    expect(card).not.toContain("compositionAttrLine");
    expect(card).toContain("PostFavoriteButton");
    expect(card).toContain("PostListMenuBottomSheet");
    expect(card).toContain("trade_promo_badge");
  });

  it("v5 (Owner 2026-11-03): 정형 3줄 · 1줄 작성일 · 사진 왼쪽 위 칩 · 예약중 · ⋮ 대신 길게 누름", () => {
    const card = src("components/post/PostCard.tsx");
    const layout = src("lib/posts/trade-feed-layout-classes.ts");
    /** 3줄 고정 높이, 홍보 텍스트 줄 없음 */
    expect(layout).toContain("grid-rows-[22px_20px_18px]");
    expect(card).toContain("TRADE_CARD_ROWS_CLASS");
    expect(card).not.toContain('data-ui4-slot="promo"');
    /** 작성일 = 거래 단일 규칙, 1줄(가격 뒤)·제목 앞 */
    expect(card).toContain("tradeListingAgeLabel");
    const price = slotIndex(card, "price");
    const age = slotIndex(card, "age");
    expect(age).toBeGreaterThan(price);
    expect(age).toBeLessThan(slotIndex(card, "title"));
    /** 왼쪽 위 칩 1개: 광고 › NEW, 판매자 광고는 바깥선 */
    expect(card).toMatch(/data-trade-card-chip="ad"[\s\S]*data-trade-card-chip="new"/);
    expect(card).toContain("TRADE_CARD_PROMOTED_OUTLINE_CLASS");
    expect(card).toContain('data-trade-card-status="reserved"');
    /** ⋮ 버튼 없음 — 길게 누름 · 오른쪽 클릭 */
    expect(card).not.toContain("⋮");
    expect(card).toContain("TRADE_CARD_LONG_PRESS_MS");
    expect(card).toContain("onContextMenu");
  });

  it("keeps thumbnail SLOT for no-image listings without ivory placeholder fill", () => {
    const card = src("components/post/PostCard.tsx");
    const layout = src("lib/posts/trade-feed-layout-classes.ts");
    expect(card).toContain("TRADE_FEED_THUMB_SLOT_EMPTY_CLASS");
    expect(card).toContain('data-market-thumb-empty');
    expect(card).not.toMatch(/hasUsableThumbnail \? \(\s*<div data-ui4-slot="photos"/);
    expect(layout).toContain("TRADE_FEED_THUMB_SLOT_EMPTY_CLASS");
    expect(layout).toContain("TRADE_FEED_THUMB_GEOMETRY_CLASS");
    // empty slot must not bake ivory muted fill into the geometry constant alone
    expect(layout).toMatch(
      /TRADE_FEED_THUMB_SLOT_EMPTY_CLASS\s*=\s*TRADE_FEED_THUMB_GEOMETRY_CLASS/
    );
  });

  it("SEARCH ProductCard keeps horizontal geometry and the same information order", () => {
    const card = src("components/product/ProductCard.tsx");
    assertInfoOrder(card);
    expect(card).toContain("h-[100px] w-[100px]");
    expect(card).toContain("relative flex gap-3");
    expect(card).not.toContain("TradeListingStatusBadge");
    expect(card).not.toContain("TimeAgo");
    expect(card).not.toContain("PostListMenuBottomSheet");
    expect(card).not.toContain("ReportReasonModal");
    expect(card).toContain("FavoriteToggleButton");
    expect(card).toContain("trade_promo_badge");
  });

  it("does not restyle SEARCH as a 2-column PostCard grid", () => {
    const list = src("components/search/SearchResultList.tsx");
    expect(list).toContain("ProductCard");
    expect(list).not.toContain("PostCard");
  });

  it("does not touch messenger mini-card, DETAIL, or CUT G writers", () => {
    const preview = src("components/post/PostListPreviewColumn.tsx");
    expect(preview).toContain("TradeListingStatusBadge");
    const detail = src("components/post/PostDetailView.tsx");
    expect(detail).toContain("data-ui5-slot");
    const favBtn = src("components/favorites/PostFavoriteButton.tsx");
    expect(favBtn).toContain("toggleFavorite");
  });

  it("favorites keep PostCard reuse without listing status surface", () => {
    const fav = src("components/favorites/FavoritePostCard.tsx");
    expect(fav).toContain("<PostCard");
    expect(fav).not.toContain("listingStatusSurface");
  });
});
