import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function promoBadgeCalls(text: string): number {
  return (text.match(/trade_promo_badge/g) ?? []).length;
}

describe("LIST/SEARCH promotion badge single render", () => {
  it("PostCard paints 홍보 from overlay helper once and does not also read hasPromotionOverlay", () => {
    const text = src("components/post/PostCard.tsx");
    expect(text).toContain("postHasTradePromotionOverlay");
    expect(promoBadgeCalls(text)).toBe(1);
    expect(text).not.toContain("hasPromotionOverlay");
  });

  it("ProductCard paints 홍보 from hasPromotionOverlay once and does not also read promotion_projection", () => {
    const text = src("components/product/ProductCard.tsx");
    expect(text).toContain("hasPromotionOverlay");
    expect(promoBadgeCalls(text)).toBe(1);
    expect(text).not.toContain("promotion_projection");
    expect(text).not.toContain("postHasTradePromotionOverlay");
  });

  it("search list uses ProductCard only", () => {
    const text = src("components/search/SearchResultList.tsx");
    expect(text).toContain("ProductCard");
    expect(text).not.toContain("PostCard");
  });
});
