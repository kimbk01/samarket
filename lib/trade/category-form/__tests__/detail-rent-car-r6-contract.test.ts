import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import { compositionFieldsForSurface } from "@/lib/trade/category-form/resolve-composition";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { resolveDetailSpecProfileId } from "@/lib/trade/category-form/detail-spec-route";

describe("detail composition + rent-car (R6)", () => {
  it("resolveDetailSpecProfileId prefers rent-car meta over used-car category", () => {
    expect(
      resolveDetailSpecProfileId({
        icon_key: "used-car",
        slug: "used-car",
        meta: { car_model: "Vios", daily_price: "2500", pickup_location: "Cebu" },
      })
    ).toBe("rent-car");
    expect(
      resolveDetailSpecProfileId({
        icon_key: "used-car",
        slug: "used-car",
        meta: { car_model: "Vios", car_year: "2021" },
      })
    ).toBe("used-car");
    expect(
      resolveDetailSpecProfileId({
        icon_key: "rent-car",
        slug: "rent-car",
        meta: { car_model: "Vios" },
      })
    ).toBe("rent-car");
  });

  it("PostDetailView uses single projector — no UsedCar/RE/Exchange MetaBlock forks", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    expect(src).toContain("resolveDetailSpecProfileId");
    expect(src).toContain("TradeCompositionDetailSection");
    expect(src).toContain("iconKey={detailSpecProfileId}");
    expect(src).toContain("JobsExtendedDetailExtras");
    expect(src).not.toContain("function UsedCarMetaBlock");
    expect(src).not.toContain("function RealEstateMetaBlock");
    expect(src).not.toContain("function ExchangeMetaBlock");
    expect(src).not.toContain("function TradeMetaBlock");
    expect(src).not.toContain("META_LABEL_KEYS");
  });

  it("TradeCompositionDetailSection owns formatters (not PostDetailView Meta if-tree)", () => {
    const projector = readFileSync(
      resolve(process.cwd(), "components/post/TradeCompositionDetailSection.tsx"),
      "utf8"
    );
    expect(projector).toContain("formatCompositionDetailField");
    expect(projector).toContain("formatJobsCompositionDetailField");
    expect(projector).toContain("resolveTradeComposition");
    const postDetail = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    expect(postDetail).not.toContain("formatUsedCarCompositionDetailField");
    expect(postDetail).not.toContain("formatExchangeCompositionDetailField");
    expect(postDetail).not.toContain("formatJobsCompositionDetailField");
  });

  it("PostDetailView spec is one projector; jobs extras are domain-only", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    const idx = src.indexOf("<JobDetailContextNote");
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 2200);
    expect(slice).toContain("JobDetailContextNote");
    expect(slice).toContain("TradeCompositionDetailSection");
    expect(slice).toContain("iconKey={detailSpecProfileId}");
    expect(slice).toContain("JobsExtendedDetailExtras");
    expect(slice).not.toContain("JobHiringDetailCards");
    expect(slice).not.toContain("JobSeekingDetailCards");
    expect(src).not.toContain("if (isRealEstateDetail)");
    expect(src).not.toContain("function UsedCarMetaBlock");
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
