import { describe, expect, it } from "vitest";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import {
  appendCompositionFilterSearchParams,
  applyCompositionFilterClausesToPostgrest,
  buildCompositionFilterClauses,
  compositionFilterCacheSegment,
  parseCompositionFilterSearchParams,
  resolveCompositionAttributeFilterFields,
  sanitizeCompositionFilterSelection,
} from "@/lib/trade/category-form/composition-filter-query";

function usedCar(overlay?: unknown) {
  return resolveTradeComposition({
    icon_key: "used-car",
    slug: "vehicle",
    fieldComposition: overlay ?? null,
  });
}

describe("composition filter query", () => {
  it("exposes active select filter fields and hides range/disabled", () => {
    const seed = usedCar();
    const ids = resolveCompositionAttributeFilterFields(seed).map((f) => f.id);
    expect(ids).toContain("body_type");
    expect(ids).toContain("make");
    expect(ids).not.toContain("mileage");
    expect(ids).not.toContain("has_accident");
    expect(ids).not.toContain("price");
    expect(ids).not.toContain("location");

    const overlayOffMileage = usedCar({
      v: 1,
      fields: [
        { id: "body_type", active: true, required: false, order: 1 },
        { id: "mileage", active: false, required: false, order: 2 },
        { id: "make", active: true, required: false, order: 3 },
      ],
    });
    const overlayIds = resolveCompositionAttributeFilterFields(overlayOffMileage).map((f) => f.id);
    expect(overlayIds).toEqual(["body_type", "make"]);
    expect(overlayIds).not.toContain("mileage");
  });

  it("does not leak used-car filters onto real-estate", () => {
    const re = resolveTradeComposition({ icon_key: "real-estate", fieldComposition: null });
    const ids = resolveCompositionAttributeFilterFields(re).map((f) => f.id);
    expect(ids).toContain("deal_type");
    expect(ids).not.toContain("body_type");
    expect(ids).not.toContain("mileage");
    expect(ids).not.toContain("bedrooms");
  });

  it("sanitizes URL filters against composition + catalog", () => {
    const composition = usedCar();
    const parsed = parseCompositionFilterSearchParams(
      new URLSearchParams("filters[body_type]=suv&filters[mileage]=5000&filters[bedrooms]=2&filters[nope]=x")
    );
    expect(parsed.body_type).toBe("suv");
    expect(parsed.mileage).toBe("5000");
    const sanitized = sanitizeCompositionFilterSelection(parsed, composition);
    expect(sanitized).toEqual({ body_type: "suv" });
    expect(sanitized.mileage).toBeUndefined();
    expect(sanitized.bedrooms).toBeUndefined();
  });

  it("does not query range mileage even when URL sends it", () => {
    const clauses = buildCompositionFilterClauses({ mileage: "10000", body_type: "suv" }, usedCar());
    expect(clauses.map((c) => c.fieldId)).toEqual(["body_type"]);
  });

  it("drops overlay-inactive fields even if URL sends them", () => {
    const composition = usedCar({
      v: 1,
      fields: [{ id: "make", active: true, required: false, order: 1 }],
    });
    const sanitized = sanitizeCompositionFilterSelection(
      { body_type: "suv", make: "toyota" },
      composition
    );
    expect(sanitized).toEqual({ make: "toyota" });
  });

  it("builds eq clause on Field Library meta key", () => {
    const clauses = buildCompositionFilterClauses({ body_type: "suv" }, usedCar());
    expect(clauses).toEqual([
      {
        fieldId: "body_type",
        op: "eq",
        columns: ["meta->>car_body_type"],
        values: ["suv"],
      },
    ]);
    const calls: string[] = [];
    const q = {
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      ilike() {
        return this;
      },
      or() {
        return this;
      },
    };
    applyCompositionFilterClausesToPostgrest(q, clauses);
    expect(calls).toEqual(["eq:meta->>car_body_type:suv"]);
  });

  it("round-trips filters[] search params", () => {
    const params = new URLSearchParams("q=civic&priceMin=1");
    appendCompositionFilterSearchParams(params, { body_type: "suv", make: "toyota" });
    expect(params.get("q")).toBe("civic");
    expect(params.get("filters[body_type]")).toBe("suv");
    expect(params.get("filters[make]")).toBe("toyota");
    expect(compositionFilterCacheSegment({ make: "toyota", body_type: "suv" })).toBe(
      "cf:body_type=suv&make=toyota"
    );
  });
});
