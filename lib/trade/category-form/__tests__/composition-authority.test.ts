import { describe, expect, it } from "vitest";
import {
  TRADE_FIELD_LIBRARY,
  TRADE_SEED_COMPOSITIONS,
  assertApprovedTradeFieldId,
  compositionFieldsForSurface,
  parseTradeFieldCompositionPayload,
  resolveTradeComposition,
  resolveTradeCompositionProfileId,
} from "@/lib/trade/category-form";
import { buildCompositionListAttributes } from "@/lib/trade/category-form/list-attributes";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";

describe("trade category-form composition authority", () => {
  it("seeds five profiles and rejects rent-car", () => {
    expect(Object.keys(TRADE_SEED_COMPOSITIONS).sort()).toEqual(
      ["exchange", "general", "jobs", "real-estate", "used-car"].sort()
    );
    expect(TRADE_SEED_COMPOSITIONS["rent-car"]).toBeUndefined();
  });

  it("maps legacy icon_key car → used-car profile", () => {
    expect(resolveTradeCompositionProfileId({ icon_key: "car" })).toBe("used-car");
    expect(resolveTradeCompositionProfileId({ icon_key: "job" })).toBe("jobs");
    expect(resolveTradeCompositionProfileId({ slug: "current" })).toBe("exchange");
  });

  it("uses product seed when field_composition is null", () => {
    const c = resolveTradeComposition({ icon_key: "used-car", fieldComposition: null });
    expect(c.source).toBe("product_seed");
    expect(c.layoutVariant).toBe("vehicle-card");
    expect(c.fields.some((f) => f.id === "mileage")).toBe(true);
    expect(c.fields.some((f) => f.id === "transmission")).toBe(true);
  });

  it("prefers db overlay and drops unknown field ids", () => {
    const c = resolveTradeComposition({
      icon_key: "used-car",
      fieldComposition: {
        v: 1,
        fields: [
          { id: "mileage", active: true, required: true, order: 1 },
          { id: "not_a_real_field", active: true, required: true, order: 2 },
          { id: "year", active: false, required: false, order: 3 },
        ],
      },
    });
    expect(c.source).toBe("db_overlay");
    expect(c.fields.map((f) => f.id)).toEqual(["mileage"]);
  });

  it("rejects invalid composition payload", () => {
    expect(parseTradeFieldCompositionPayload({ v: 2, fields: [] })).toBeNull();
    expect(parseTradeFieldCompositionPayload({ v: 1, fields: [{ id: "nope" }] })).toBeNull();
  });

  it("every seed field exists in Field Library", () => {
    for (const seed of Object.values(TRADE_SEED_COMPOSITIONS)) {
      for (const row of seed.fields) {
        expect(assertApprovedTradeFieldId(row.id), row.id).toBe(true);
        expect(TRADE_FIELD_LIBRARY[row.id]).toBeTruthy();
      }
    }
  });

  it("list attributes format mileage from meta without skin if", () => {
    const composition = resolveTradeComposition({ icon_key: "used-car" });
    const attrs = buildCompositionListAttributes({
      composition,
      meta: { mileage: "35000", car_model: "Toyota Vios", car_year: "2020" },
    });
    expect(attrs.some((a) => a.fieldId === "mileage" && a.text.includes("35,000"))).toBe(true);
    expect(compositionFieldsForSurface(composition, "list").some((f) => f.id === "mileage")).toBe(
      true
    );
  });

  it("make/model keep combined_meta storage strategy", () => {
    const make = TRADE_FIELD_LIBRARY.make;
    expect(make.storage.kind).toBe("combined_meta");
    if (make.storage.kind === "combined_meta") {
      expect(make.storage.writeKey).toBe("car_model");
    }
  });

  it("detail attributes project real-estate meta without skin if", () => {
    const composition = resolveTradeComposition({ icon_key: "real-estate" });
    const adapted = applyTradeBehaviorAdapter(composition, { dealType: "임대" });
    const attrs = buildCompositionDetailAttributes({
      composition,
      adaptedFields: adapted,
      meta: {
        deal_type: "임대",
        estate_type: "콘도",
        deposit: "100000",
        monthly: "15000",
        size_sq: "32",
        room_count: "2",
        bathroom_count: "1",
        move_in_date: "즉시입주",
      },
      lang: "ko",
    });
    expect(attrs.some((a) => a.fieldId === "deposit")).toBe(true);
    expect(attrs.some((a) => a.fieldId === "price")).toBe(false);
    expect(attrs.some((a) => a.fieldId === "floor_area")).toBe(true);
  });
});
