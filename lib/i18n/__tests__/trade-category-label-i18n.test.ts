import { describe, expect, it } from "vitest";
import {
  resolveTradeCategoryUILabel,
  resolveWriteCategoryUILabel,
} from "@/lib/i18n/trade-category-label-i18n";

describe("resolveTradeCategoryUILabel", () => {
  it("uses name_en in English when provided", () => {
    expect(resolveTradeCategoryUILabel("en", "중고거래", "Used goods", "market", "market")).toBe(
      "Used goods"
    );
  });

  it("falls back to catalog via icon_key when name_en is missing", () => {
    expect(resolveTradeCategoryUILabel("en", "중고거래", null, "market", "market")).toBe("Used goods");
    expect(resolveTradeCategoryUILabel("en", "중고차", null, "used-car", "used-car")).toBe("Used cars");
    expect(resolveTradeCategoryUILabel("en", "부동산", null, "real-estate", "real-estate")).toBe(
      "Real estate"
    );
    expect(resolveTradeCategoryUILabel("en", "환전거래", null, "exchange", "exchange")).toBe(
      "Currency exchange"
    );
    expect(resolveTradeCategoryUILabel("en", "일자리", null, "jobs", "jobs")).toBe("Jobs");
  });

  it("keeps Korean admin name in ko", () => {
    expect(resolveTradeCategoryUILabel("ko", "중고거래", "Used goods", "market", "market")).toBe(
      "중고거래"
    );
  });
});

describe("resolveWriteCategoryUILabel", () => {
  it("localizes trade categories for write sheet dropdown", () => {
    expect(
      resolveWriteCategoryUILabel("en", {
        name: "중고거래",
        name_en: null,
        slug: "market",
        icon_key: "market",
        type: "trade",
      })
    ).toBe("Used goods");
  });
});
