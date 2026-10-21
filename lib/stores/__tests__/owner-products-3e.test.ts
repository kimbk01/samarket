/**
 * 3-E 상품 P3 — 순수 규칙: PRD-15 상한 · PRD-14 옵션 중복 · PRD-10 자동 품절 · PRD-11 정렬 본문 ·
 * PRD-12 오너=구매자 순서 · PRD-16 고아 객체 판정.
 */
import { describe, expect, it } from "vitest";
import {
  OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX,
  OWNER_PRODUCT_PRICE_MAX,
  OWNER_PRODUCT_STOCK_MAX,
  OWNER_PRODUCT_SUMMARY_MAX,
  OWNER_PRODUCT_TITLE_MAX,
  parseOwnerProductClientRequestId,
  validateOwnerProductFields,
} from "@/lib/stores/owner-product-field-limits";
import {
  normalizeOwnerOptionChoiceName,
  validateOwnerOptionsJsonPayload,
  validateProductOptionGroups,
} from "@/lib/stores/owner-product-options-validate";
import { emptyOptionGroup } from "@/lib/stores/owner-product-options-json";
import { shouldAutoSoldOutOnOwnerSave } from "@/lib/stores/owner-product-auto-sold-out";
import { parseMenuSectionOrderIds } from "@/lib/stores/menu-section-order";
import { sortOwnerProductsListRowsForBuyerOrder } from "@/lib/stores/owner-products-list-snapshot";
import {
  parseStoreDetailProducts,
  sortStoreDetailProductCardsForDisplay,
} from "@/lib/stores/group-store-products-by-menu";
import {
  collectStoreImagePathsFromValues,
  isStoreProductImagesOrphanGcDeleteEnabled,
  planStoreProductImageOrphans,
  storeImageBaseKey,
  STORE_IMAGE_ORPHAN_MIN_AGE_MS,
} from "@/lib/stores/store-product-images-orphan-gc";

describe("PRD-15 validateOwnerProductFields — boundaries", () => {
  it("accepts values at the limit and rejects one above", () => {
    expect(validateOwnerProductFields({ title: "a".repeat(OWNER_PRODUCT_TITLE_MAX) }).ok).toBe(true);
    const t = validateOwnerProductFields({ title: "a".repeat(OWNER_PRODUCT_TITLE_MAX + 1) });
    expect(t).toMatchObject({ ok: false, error: "title_too_long" });
    expect(validateOwnerProductFields({ summary: "s".repeat(OWNER_PRODUCT_SUMMARY_MAX) }).ok).toBe(true);
    expect(validateOwnerProductFields({ summary: "s".repeat(OWNER_PRODUCT_SUMMARY_MAX + 1) })).toMatchObject({
      ok: false,
      error: "summary_too_long",
    });
    expect(validateOwnerProductFields({ price: OWNER_PRODUCT_PRICE_MAX }).ok).toBe(true);
    expect(validateOwnerProductFields({ price: OWNER_PRODUCT_PRICE_MAX + 1 })).toMatchObject({
      ok: false,
      error: "price_too_large",
    });
    expect(validateOwnerProductFields({ stock_qty: OWNER_PRODUCT_STOCK_MAX }).ok).toBe(true);
    expect(validateOwnerProductFields({ stock_qty: OWNER_PRODUCT_STOCK_MAX + 1 })).toMatchObject({
      ok: false,
      error: "stock_too_large",
    });
  });

  it("undefined fields are not checked (unchanged fields pass — preservation)", () => {
    expect(validateOwnerProductFields({}).ok).toBe(true);
  });

  it("title limit counts trimmed length and the message carries the limit", () => {
    expect(validateOwnerProductFields({ title: `  ${"a".repeat(120)}  ` }).ok).toBe(true);
    const r = validateOwnerProductFields({ title: "a".repeat(121) }, "ko");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("120");
  });

  it("client_request_id parser", () => {
    expect(parseOwnerProductClientRequestId("3f2a9d1c-1111-4444-8888-000000000000")).toBe(
      "3f2a9d1c-1111-4444-8888-000000000000"
    );
    expect(parseOwnerProductClientRequestId("short")).toBeNull();
    expect(parseOwnerProductClientRequestId("has space 123456")).toBeNull();
    expect(parseOwnerProductClientRequestId(42)).toBeNull();
  });
});

function group(over: Partial<ReturnType<typeof emptyOptionGroup>> = {}) {
  return { ...emptyOptionGroup(), nameKo: "Size", ...over };
}

describe("PRD-14 option groups — duplicate names / ids, PRD-15 price delta cap", () => {
  it("rejects duplicate choice names in one group (case/space normalized)", () => {
    const g = group({
      options: [
        { id: "o1", name: "Large", priceDelta: "0", soldOut: false, defaultSelected: false },
        { id: "o2", name: "  large ", priceDelta: "50", soldOut: false, defaultSelected: false },
      ],
    });
    const r = validateProductOptionGroups([g], "ko");
    expect(r).toMatchObject({ ok: false, code: "duplicate_option_name" });
  });

  it("same choice name in different groups is fine", () => {
    const opts = [{ id: "o1", name: "Large", priceDelta: "0", soldOut: false, defaultSelected: false }];
    const r = validateProductOptionGroups(
      [group({ groupLocalId: "g1", options: opts }), group({ groupLocalId: "g2", nameKo: "Cup", options: opts })],
      "ko"
    );
    expect(r.ok).toBe(true);
  });

  it("rejects duplicate group ids", () => {
    const opts = [{ id: "o1", name: "A", priceDelta: "0", soldOut: false, defaultSelected: false }];
    const r = validateProductOptionGroups(
      [group({ groupLocalId: "same", options: opts }), group({ groupLocalId: "same", options: opts })],
      "ko"
    );
    expect(r).toMatchObject({ ok: false, code: "duplicate_option_group_id" });
  });

  it("API payload: duplicate names → duplicate_option_name; explicit duplicate group id → duplicate_option_group_id", () => {
    const dupName = validateOwnerOptionsJsonPayload([
      {
        id: "g1",
        nameKo: "Size",
        inputType: "radio",
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: "a", name: "L", priceDelta: 0 },
          { id: "b", name: "l", priceDelta: 10 },
        ],
      },
    ]);
    expect(dupName).toMatchObject({ ok: false, error: "duplicate_option_name" });
    const base = {
      nameKo: "Size",
      inputType: "radio",
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ id: "a", name: "L", priceDelta: 0 }],
    };
    expect(validateOwnerOptionsJsonPayload([{ ...base, id: "g1" }, { ...base, id: "g1" }])).toMatchObject({
      ok: false,
      error: "duplicate_option_group_id",
    });
    // legacy groups without ids fall back to index keys — not a duplicate
    expect(validateOwnerOptionsJsonPayload([{ ...base }, { ...base }]).ok).toBe(true);
  });

  it("price delta cap", () => {
    const at = group({
      options: [
        { id: "o1", name: "A", priceDelta: String(OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX), soldOut: false, defaultSelected: false },
      ],
    });
    expect(validateProductOptionGroups([at], "ko").ok).toBe(true);
    const over = group({
      options: [
        { id: "o1", name: "A", priceDelta: String(OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX + 1), soldOut: false, defaultSelected: false },
      ],
    });
    expect(validateProductOptionGroups([over], "ko").ok).toBe(false);
  });

  it("normalizer", () => {
    expect(normalizeOwnerOptionChoiceName("  Extra   Shot ")).toBe("extra shot");
  });
});

describe("PRD-10 shouldAutoSoldOutOnOwnerSave", () => {
  it("tracked + stock 0 + active → true (create and patch)", () => {
    expect(shouldAutoSoldOutOnOwnerSave(null, { product_status: "active", track_inventory: true, stock_qty: 0 })).toBe(true);
    expect(
      shouldAutoSoldOutOnOwnerSave({ product_status: "active", track_inventory: true, stock_qty: 5 }, { stock_qty: 0 })
    ).toBe(true);
    // existing row already at 0 — applied on the next save of any field
    expect(
      shouldAutoSoldOutOnOwnerSave({ product_status: "active", track_inventory: true, stock_qty: 0 }, {})
    ).toBe(true);
  });

  it("untracked / non-active / stock > 0 → false", () => {
    expect(shouldAutoSoldOutOnOwnerSave(null, { product_status: "active", track_inventory: false, stock_qty: 0 })).toBe(false);
    expect(shouldAutoSoldOutOnOwnerSave(null, { product_status: "hidden", track_inventory: true, stock_qty: 0 })).toBe(false);
    expect(
      shouldAutoSoldOutOnOwnerSave({ product_status: "active", track_inventory: true, stock_qty: 0 }, { stock_qty: 3 })
    ).toBe(false);
    expect(
      shouldAutoSoldOutOnOwnerSave({ product_status: "active", track_inventory: true, stock_qty: 0 }, { track_inventory: false })
    ).toBe(false);
  });
});

describe("PRD-11 parseMenuSectionOrderIds", () => {
  const a = "5ec00000-0000-0000-0000-000000000001";
  const b = "5ec00000-0000-0000-0000-000000000002";
  it("accepts uuid list, rejects empty / non-uuid / duplicates", () => {
    expect(parseMenuSectionOrderIds([a, b])).toEqual({ ok: true, value: [a, b] });
    expect(parseMenuSectionOrderIds([])).toMatchObject({ ok: false, error: "invalid_section_ids" });
    expect(parseMenuSectionOrderIds(["x"])).toMatchObject({ ok: false, error: "invalid_section_ids" });
    expect(parseMenuSectionOrderIds([a, a.toUpperCase()])).toMatchObject({ ok: false, error: "duplicate_section_ids" });
    expect(parseMenuSectionOrderIds("nope")).toMatchObject({ ok: false });
  });
});

describe("PRD-12 owner hub default order = buyer menu order", () => {
  it("same input → same order as sortStoreDetailProductCardsForDisplay (featured no longer first)", () => {
    const sec = (id: string, sort_order: number) => ({ id, name: id, sort_order, is_hidden: false });
    const rows = [
      { id: "p1", title: "Zebra", sort_order: 0, is_featured: true, menu_section_id: "s2", store_menu_sections: sec("s2", 1) },
      { id: "p2", title: "Apple", sort_order: 1, is_featured: false, menu_section_id: "s1", store_menu_sections: sec("s1", 0) },
      { id: "p3", title: "Banana", sort_order: 0, is_featured: false, menu_section_id: "s1", store_menu_sections: sec("s1", 0) },
      { id: "p4", title: "Cherry", sort_order: 0, is_featured: false, menu_section_id: null },
      { id: "p5", title: "Avocado", sort_order: 0, is_featured: true, menu_section_id: "s2", store_menu_sections: sec("s2", 1) },
    ];
    const owner = sortOwnerProductsListRowsForBuyerOrder(rows).map((r) => r.id);
    const buyer = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(rows)).map((c) => c.id);
    expect(owner).toEqual(buyer);
    expect(owner).toEqual(["p3", "p2", "p5", "p1", "p4"]);
  });
});

describe("PRD-16 orphan image plan", () => {
  const sid = "076bffda-3048-4bfb-80ae-985a69105f4a";
  const other = "278dc6b7-4de8-4528-83c1-eff7c2b121d4";
  const base = "https://x.supabase.co/storage/v1/object/public/store-product-images";
  const now = Date.parse("2026-10-21T00:00:00Z");
  const old = new Date(now - STORE_IMAGE_ORPHAN_MIN_AGE_MS - 1000).toISOString();
  const young = new Date(now - 60_000).toISOString();

  it("collects only this store's paths from whole rows (any column, render URLs, json arrays)", () => {
    const rows = [
      { thumbnail_url: `${base}/${sid}/a.webp`, images_json: [`${base}/${sid}/b.webp`, `${base}/${other}/x.webp`] },
      { cover: `https://x.supabase.co/storage/v1/render/image/public/store-product-images/${sid}/c.jpg?width=200` },
      { unrelated: "post-images/zzz.webp" },
      null,
    ];
    const paths = collectStoreImagePathsFromValues(sid, rows);
    expect([...paths].sort()).toEqual([`${sid}/a.webp`, `${sid}/b.webp`, `${sid}/c.jpg`]);
  });

  it("base key groups originals and derivatives", () => {
    expect(storeImageBaseKey(`${sid}/u1.hero.webp`)).toBe(`${sid}/u1`);
    expect(storeImageBaseKey(`${sid}/u1.webp`)).toBe(`${sid}/u1`);
  });

  it("referenced (incl. derivative of referenced original) kept, young kept, old unreferenced = orphan", () => {
    const plan = planStoreProductImageOrphans({
      storeId: sid,
      nowMs: now,
      referencedPaths: [`${sid}/kept.webp`],
      objects: [
        { path: `${sid}/kept.webp`, created_at: old },
        { path: `${sid}/kept.hero.webp`, created_at: old },
        { path: `${sid}/fresh.webp`, created_at: young },
        { path: `${sid}/nodate.webp`, created_at: null },
        { path: `${sid}/orphan.webp`, created_at: old },
        { path: `${sid}/orphan.hero.webp`, created_at: old },
        { path: `${other}/foreign.webp`, created_at: old },
      ],
    });
    expect(plan.orphanPaths).toEqual([`${sid}/orphan.webp`, `${sid}/orphan.hero.webp`]);
    expect(plan.keptReferenced).toBe(2);
    expect(plan.keptYoung).toBe(2);
    expect(plan.skippedUnsafe).toBe(1);
  });

  it("deletion stays off unless the Owner-approved env flag is exactly 1", () => {
    expect(isStoreProductImagesOrphanGcDeleteEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isStoreProductImagesOrphanGcDeleteEnabled({ STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED: "true" } as never)
    ).toBe(false);
    expect(
      isStoreProductImagesOrphanGcDeleteEnabled({ STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED: "1" } as never)
    ).toBe(true);
  });
});
