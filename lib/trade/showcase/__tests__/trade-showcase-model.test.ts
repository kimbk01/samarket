import { describe, expect, it } from "vitest";
import {
  parseTradeShowcaseInput,
  shouldShowTradeShowcase,
  TRADE_SHOWCASE_MIN_REAL_ITEMS,
} from "@/lib/trade/showcase/trade-showcase-model";

describe("trade showcase (P-7)", () => {
  it("requires a title and normalizes price/images", () => {
    expect(parseTradeShowcaseInput({ title: "  " })).toEqual({ ok: false, error: "title_required" });
    const r = parseTradeShowcaseInput({
      title: " 원목 의자 ",
      price: "2,500",
      image_urls: ["https://x/a.webp", "javascript:alert(1)", 3],
      trade_category_id: "",
      is_active: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("원목 의자");
      expect(r.value.price).toBe(2500);
      expect(r.value.image_urls).toEqual(["https://x/a.webp"]);
      expect(r.value.trade_category_id).toBeNull();
      expect(r.value.is_active).toBe(false);
    }
  });

  it("rejects bad price, category and too many images", () => {
    expect(parseTradeShowcaseInput({ title: "a", price: -1 })).toEqual({ ok: false, error: "invalid_price" });
    expect(parseTradeShowcaseInput({ title: "a", trade_category_id: "x" })).toEqual({ ok: false, error: "invalid_category" });
    const many = Array.from({ length: 11 }, (_, i) => `https://x/${i}.webp`);
    expect(parseTradeShowcaseInput({ title: "a", image_urls: many })).toEqual({ ok: false, error: "too_many_images" });
  });

  it("shows examples only when not searching, settled, and real items are few", () => {
    expect(shouldShowTradeShowcase({ realCount: 0, hasSearchQuery: false, listSettled: true })).toBe(true);
    expect(shouldShowTradeShowcase({ realCount: 0, hasSearchQuery: true, listSettled: true })).toBe(false);
    expect(shouldShowTradeShowcase({ realCount: 3, hasSearchQuery: false, listSettled: false })).toBe(false);
    expect(
      shouldShowTradeShowcase({ realCount: TRADE_SHOWCASE_MIN_REAL_ITEMS, hasSearchQuery: false, listSettled: true })
    ).toBe(false);
  });
});
