import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import { compositionFieldsForSurface } from "@/lib/trade/category-form/resolve-composition";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";

describe("detail composition + rent-car (R6)", () => {
  it("PostDetailView routes rent-car before used-car meta heuristic", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    expect(src).toContain('profileId === "rent-car"');
    expect(src).toContain("TradeCompositionDetailSection");
    expect(src).toContain("compositionProfileId: detailCompositionProfileId");
    expect(src).toContain('category.icon_key !== "rent-car"');
    // raw META_LABEL_KEYS skin dump removed
    expect(src).not.toContain("META_LABEL_KEYS");
  });

  it("TradeMetaBlock delegates non-RE skins to TradeCompositionDetailSection", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    const idx = src.indexOf("function TradeMetaBlock");
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 1200);
    expect(slice).toContain("TradeCompositionDetailSection");
    expect(slice).not.toContain("buildCompositionDetailAttributes");
  });

  it("rent-car seed projects daily_price on detail surface", () => {
    const composition = resolveTradeComposition({ icon_key: "rent-car", fieldComposition: null });
    expect(composition.layoutVariant).toBe("rental-card");
    expect(compositionFieldsForSurface(composition, "detail").some((f) => f.id === "daily_price")).toBe(
      true
    );
    const attrs = buildCompositionDetailAttributes({
      composition,
      meta: {
        car_model: "Toyota Vios",
        car_year: "2021",
        daily_price: "2500",
        pickup_location: "Cebu IT Park",
      },
      lang: "ko",
    });
    expect(attrs.some((a) => a.fieldId === "daily_price")).toBe(true);
    expect(attrs.some((a) => a.fieldId === "pickup_location" && a.value.includes("Cebu"))).toBe(true);
  });
});
