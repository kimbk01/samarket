import { describe, expect, it } from "vitest";
import {
  BROWSE_CARD_MENU_STRIP_MAX_PHOTOS,
  buildBrowseCardMenuStrip,
  normalizeBrowseFeaturedDiscountPrice,
  resolveMenuPriceDisplay,
} from "@/lib/stores/browse-card-menu-strip";
import { STORES_BROWSE_CATEGORY_PRESENTATION } from "@/lib/stores/stores-browse-category-presentation-spec";
import { BROWSE_FEATURED_ITEMS_MAX } from "@/lib/stores/stores-browse-build";

/** WP5 (배민형 2차수 2026-10-29) — 목록 카드 가로 사진 줄 */
describe("WP5 browse card menu strip", () => {
  const item = (i: number, img: string | null = `https://x/${i}.jpg`) => ({
    productId: `p${i}`,
    name: `메뉴${i}`,
    price: 100 + i,
    imageUrl: img,
  });

  it("최대 6장 — 데이터 상한·명세 장수와 같음", () => {
    expect(BROWSE_CARD_MENU_STRIP_MAX_PHOTOS).toBe(6);
    expect(STORES_BROWSE_CATEGORY_PRESENTATION.menuTileVisibleCount).toBe(6);
    expect(BROWSE_FEATURED_ITEMS_MAX).toBe(6);
    const strip = buildBrowseCardMenuStrip(Array.from({ length: 9 }, (_, i) => item(i)));
    expect(strip.photos.map((p) => p.productId)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5"]);
    expect(strip.showMoreTile).toBe(true);
  });

  it("사진 없는 메뉴는 건너뛰고 서버 순서 유지", () => {
    const strip = buildBrowseCardMenuStrip([item(0, null), item(1), item(2, "  "), item(3)]);
    expect(strip.photos.map((p) => p.productId)).toEqual(["p1", "p3"]);
  });

  it("사진 0장이면 더보기 타일 없음(기존 단독 더보기 버튼 경로)", () => {
    expect(buildBrowseCardMenuStrip([item(0, null)])).toEqual({ photos: [], showMoreTile: false });
  });

  it("4:3 · 3.2장 · 1.5px · 4px 명세", () => {
    expect(STORES_BROWSE_CATEGORY_PRESENTATION.menuStrip).toEqual({
      aspectRatio: "4 / 3",
      perViewport: 3.2,
      leadingInsetPx: 16,
      gapPx: 1.5,
      outerRadiusPx: 4,
    });
  });

  it("할인가: 원가보다 작을 때만 할인가 굵게 + 원가 취소선", () => {
    expect(resolveMenuPriceDisplay(200, 150)).toEqual({ currentPhp: 150, originalPhp: 200 });
    expect(resolveMenuPriceDisplay(200, 200)).toEqual({ currentPhp: 200, originalPhp: null });
    expect(resolveMenuPriceDisplay(200, 250)).toEqual({ currentPhp: 200, originalPhp: null });
    expect(resolveMenuPriceDisplay(200, null)).toEqual({ currentPhp: 200, originalPhp: null });
    expect(resolveMenuPriceDisplay(200, Number.NaN)).toEqual({ currentPhp: 200, originalPhp: null });
    expect(resolveMenuPriceDisplay(200, 0)).toEqual({ currentPhp: 0, originalPhp: 200 });
  });

  it("서버 조립: 의미 있는 할인가만 남김", () => {
    expect(normalizeBrowseFeaturedDiscountPrice(200, 150)).toBe(150);
    expect(normalizeBrowseFeaturedDiscountPrice(200, 200)).toBeNull();
    expect(normalizeBrowseFeaturedDiscountPrice(200, undefined)).toBeNull();
    const strip = buildBrowseCardMenuStrip([{ ...item(0), price: 300, discountPrice: 250 }]);
    expect(strip.photos[0]?.price).toEqual({ currentPhp: 250, originalPhp: 300 });
  });
});
