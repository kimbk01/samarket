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
  it("PostCard is photo → price → title → location without status/spec/time", () => {
    const card = src("components/post/PostCard.tsx");
    assertInfoOrder(card);
    expect(card).not.toContain("TradeListingStatusBadge");
    expect(card).not.toContain("formatTimeAgo");
    expect(card).not.toContain("compositionAttrLine");
    expect(card).toContain("PostFavoriteButton");
    expect(card).toContain("PostListMenuBottomSheet");
    expect(card).toContain("trade_promo_badge");
    expect(card).toContain('data-ui4-slot="promo"');
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
