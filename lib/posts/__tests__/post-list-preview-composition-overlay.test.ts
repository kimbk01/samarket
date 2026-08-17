import { describe, expect, it } from "vitest";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";

describe("list preview field_composition (R5)", () => {
  const usedCarPost = {
    type: "trade",
    title: "Vios",
    price: 450000,
    meta: {
      car_trade: "sell",
      car_model: "Toyota Vios",
      car_year: "2020",
      mileage: "35000",
    },
    created_at: "2026-07-01T00:00:00.000Z",
  };

  it("seed path still shows mileage on used-car list when fieldComposition is null", () => {
    const model = buildPostListPreviewModel(usedCarPost, {
      currency: "PHP",
      locale: "ko",
      skinKey: "used-car",
      fieldComposition: null,
    });
    const joined = model?.bodyBlocks.map((b) => b.text).join(" | ") ?? "";
    expect(joined).toMatch(/35/);
    expect(joined).toMatch(/km/i);
  });

  it("Admin overlay without mileage drops mileage from used-car list line", () => {
    const model = buildPostListPreviewModel(usedCarPost, {
      currency: "PHP",
      locale: "ko",
      skinKey: "used-car",
      fieldComposition: {
        v: 1,
        fields: [
          { id: "make", active: true, required: true, order: 1 },
          { id: "model", active: true, required: true, order: 2 },
          { id: "year", active: true, required: true, order: 3 },
          { id: "mileage", active: false, required: false, order: 4 },
        ],
      },
    });
    const joined = model?.bodyBlocks.map((b) => b.text).join(" | ") ?? "";
    expect(joined).not.toMatch(/35,?000/);
    expect(joined).not.toMatch(/\bkm\b/i);
    expect(joined).toMatch(/Toyota Vios|2020/);
  });

  it("Admin overlay real-estate drops bedrooms from list when inactive", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Condo",
        price: 1000000,
        meta: {
          deal_type: "매매",
          estate_type: "Condo",
          size_sq: "45",
          room_count: "2",
        },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      {
        currency: "PHP",
        locale: "ko",
        skinKey: "real-estate",
        fieldComposition: {
          v: 1,
          fields: [
            { id: "deal_type", active: true, required: true, order: 1 },
            { id: "estate_type", active: true, required: true, order: 2 },
            { id: "floor_area", active: true, required: true, order: 3 },
            { id: "bedrooms", active: false, required: false, order: 4 },
          ],
        },
      }
    );
    const joined = model?.bodyBlocks.map((b) => b.text).join(" | ") ?? "";
    expect(joined).toMatch(/45/);
    // bedrooms inactive → room_count must not appear on composition list line
    const specLine = model?.bodyBlocks.find((b) => b.text.includes("sq"))?.text ?? "";
    expect(specLine).not.toMatch(/(^|·)\s*2(\s|·|$)/);
  });
});
