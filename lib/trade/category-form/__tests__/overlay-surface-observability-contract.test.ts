/**
 * §4 ADMIN — overlay {id,active,required,order} must reach WRITE / LIST / DETAIL
 * projectors. JSONB must not persist widget / storage / CTA / layoutVariant.
 * Live Admin UI save remains a separate runtime row.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { buildCompositionListAttributes } from "@/lib/trade/category-form/list-attributes";
import {
  parseTradeFieldCompositionPayload,
  serializeTradeFieldCompositionPayload,
} from "@/lib/trade/category-form/parse-field-composition";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";

const RENT_OVERLAY_WITHOUT_DAILY_PRICE = {
  v: 1 as const,
  fields: [
    { id: "images", active: true, required: true, order: 10 },
    { id: "make", active: true, required: true, order: 20 },
    { id: "model", active: true, required: true, order: 30 },
    { id: "year", active: true, required: true, order: 40 },
    { id: "daily_price", active: false, required: false, order: 50 },
    { id: "mileage_cap", active: true, required: false, order: 60 },
    { id: "pickup_location", active: true, required: true, order: 90 },
    { id: "description", active: true, required: true, order: 130 },
    { id: "location", active: true, required: true, order: 140 },
  ],
};

const META = {
  car_model: "Toyota Vios",
  car_year: "2021",
  daily_price: "2500",
  mileage_cap: "200",
  pickup_location: "Cebu IT Park",
};

describe("Admin overlay observability (WRITE / LIST / DETAIL)", () => {
  it("serialize keeps only id/active/required/order — strips widget/storage/CTA/layout", () => {
    const parsed = parseTradeFieldCompositionPayload({
      v: 1,
      fields: [
        {
          id: "price",
          active: true,
          required: true,
          order: 10,
          widget: "hack",
          storagePath: "meta.x",
          cta: "chat",
          layoutVariant: "vehicle-card",
        },
      ],
    });
    expect(parsed).toBeTruthy();
    const stored = serializeTradeFieldCompositionPayload(parsed!);
    expect(stored).toEqual({
      v: 1,
      fields: [{ id: "price", active: true, required: true, order: 10 }],
    });
    expect(JSON.stringify(stored)).not.toMatch(/widget|storagePath|layoutVariant|"cta"/);
  });

  it("overlay active:false drops daily_price from WRITE adapted ids, LIST attrs, DETAIL attrs", () => {
    const composition = resolveTradeComposition({
      icon_key: "rent-car",
      fieldComposition: RENT_OVERLAY_WITHOUT_DAILY_PRICE,
    });
    expect(composition.source).toBe("db_overlay");
    expect(composition.fields.map((f) => f.id)).not.toContain("daily_price");
    expect(composition.fields.map((f) => f.id)).toContain("pickup_location");

    const writeIds = applyTradeBehaviorAdapter(composition, {})
      .filter((f) => f.visible)
      .map((f) => f.id);
    expect(writeIds).not.toContain("daily_price");
    expect(writeIds).toContain("pickup_location");

    const listAttrs = buildCompositionListAttributes({
      composition,
      meta: META,
      post: { price: 2500 },
      lang: "ko",
    });
    expect(listAttrs.some((a) => a.fieldId === "daily_price")).toBe(false);
    expect(listAttrs.some((a) => a.fieldId === "mileage_cap")).toBe(true);

    const detailAttrs = buildCompositionDetailAttributes({
      composition,
      adaptedFields: applyTradeBehaviorAdapter(composition, {}),
      meta: META,
      post: { price: 2500 },
      lang: "ko",
    });
    expect(detailAttrs.some((a) => a.fieldId === "daily_price")).toBe(false);
    expect(detailAttrs.some((a) => a.fieldId === "pickup_location" && a.value.includes("Cebu"))).toBe(
      true
    );
  });

  it("overlay order and required reach resolved WRITE fields", () => {
    const composition = resolveTradeComposition({
      icon_key: "rent-car",
      fieldComposition: {
        v: 1,
        fields: [
          { id: "pickup_location", active: true, required: true, order: 1 },
          { id: "daily_price", active: true, required: false, order: 2 },
        ],
      },
    });
    expect(composition.fields.map((f) => f.id)).toEqual(["pickup_location", "daily_price"]);
    expect(composition.fields.find((f) => f.id === "daily_price")?.required).toBe(false);
    expect(composition.fields.find((f) => f.id === "pickup_location")?.required).toBe(true);
  });

  it("Admin save + WRITE Generic + LIST overlay skip + DETAIL projector stay wired", () => {
    const upsert = readFileSync(resolve(process.cwd(), "lib/categories/upsertCategorySettings.ts"), "utf8");
    expect(upsert).toContain("parseTradeFieldCompositionPayload");
    expect(upsert).toContain("serializeTradeFieldCompositionPayload");
    expect(upsert).toContain("field_composition");

    const generic = readFileSync(
      resolve(process.cwd(), "components/write/trade/generic/GenericTradeWriteFields.tsx"),
      "utf8"
    );
    expect(generic).toContain("f.visible");

    const write = readFileSync(resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"), "utf8");
    expect(write).toContain("resolveTradeCompositionForCategory");

    const list = readFileSync(resolve(process.cwd(), "lib/posts/post-list-preview-model.ts"), "utf8");
    expect(list).toContain("fieldComposition: opts.fieldComposition ?? null");
    expect(list).toContain('listComposition.source === "db_overlay"');

    const detail = readFileSync(
      resolve(process.cwd(), "components/post/TradeCompositionDetailSection.tsx"),
      "utf8"
    );
    expect(detail).toContain("fieldComposition: props.fieldComposition ?? null");
    const postDetail = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    expect(postDetail).toContain("field_composition");
  });
});
