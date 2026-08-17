import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { TRADE_SEED_COMPOSITIONS } from "@/lib/trade/category-form/composition-seeds";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { buildCompositionListAttributes } from "@/lib/trade/category-form/list-attributes";
import {
  resolveTradeCompositionForCategory,
  resolveTradeCompositionForCategoryId,
  resolveTradeCompositionRootRow,
} from "@/lib/trade/category-form/resolve-for-category";
import { buildTradeListCompositionMapFromCategories } from "@/lib/trade/category-form/use-trade-list-composition-map";

const ROOT_ID = "vehicle";
const CHILD_ID = "vehicle-child";

const MILEAGE_META = { car_model: "Fortuner", car_year: "2020", mileage: "45000" };

function usedCarOverlayMileage(active: boolean) {
  return {
    v: 1 as const,
    fields: TRADE_SEED_COMPOSITIONS["used-car"]!.fields.map((f) =>
      f.id === "mileage" ? { ...f, active, required: active } : { ...f }
    ),
  };
}

function settings(field_composition: unknown | null): NonNullable<CategoryWithSettings["settings"]> {
  return {
    can_write: true,
    has_price: true,
    has_chat: true,
    has_location: true,
    has_direct_deal: true,
    has_free_share: true,
    post_type: "post",
    field_composition,
  };
}

function cat(
  partial: Partial<CategoryWithSettings> & Pick<CategoryWithSettings, "id">
): CategoryWithSettings {
  return {
    name: partial.name ?? partial.id,
    name_en: null,
    slug: partial.slug ?? partial.id,
    icon_key: partial.icon_key ?? "used-car",
    type: "trade",
    parent_id: partial.parent_id ?? null,
    sort_order: 0,
    is_active: true,
    description: null,
    created_at: "",
    updated_at: "",
    quick_create_enabled: true,
    quick_create_group: null,
    quick_create_order: 0,
    show_in_home_chips: true,
    settings: partial.settings ?? null,
    ...partial,
  };
}

function byIdOf(rows: CategoryWithSettings[]) {
  return new Map(rows.map((r) => [r.id, r]));
}

describe("CUT A1 option ROOT SSOT", () => {
  it("root id resolves to itself", () => {
    const root = cat({ id: ROOT_ID, slug: "vehicle" });
    const map = byIdOf([root]);
    expect(resolveTradeCompositionRootRow(ROOT_ID, map)?.id).toBe(ROOT_ID);
    expect(resolveTradeCompositionForCategoryId(ROOT_ID, map)?.source).toBe("product_seed");
  });

  it("missing category id and empty id return null (no invented fallback)", () => {
    const map = byIdOf([cat({ id: ROOT_ID })]);
    expect(resolveTradeCompositionRootRow("", map)).toBeNull();
    expect(resolveTradeCompositionRootRow("missing", map)).toBeNull();
    expect(resolveTradeCompositionForCategoryId(null, map)).toBeNull();
  });

  it("missing parent keeps the child row", () => {
    const child = cat({ id: CHILD_ID, parent_id: "gone-parent", slug: "orphan-child" });
    const map = byIdOf([child]);
    expect(resolveTradeCompositionRootRow(CHILD_ID, map)?.id).toBe(CHILD_ID);
  });

  it("child-id listing uses ROOT overlay: mileage OFF is hidden on LIST and DETAIL", () => {
    const overlay = usedCarOverlayMileage(false);
    const root = cat({
      id: ROOT_ID,
      slug: "vehicle",
      settings: settings(overlay),
    });
    const child = cat({
      id: CHILD_ID,
      parent_id: ROOT_ID,
      slug: "suv",
      settings: settings(null),
    });
    const map = byIdOf([root, child]);

    const childDirect = resolveTradeCompositionForCategory(child);
    expect(childDirect.fields.some((f) => f.id === "mileage")).toBe(true);

    const fromChildId = resolveTradeCompositionForCategoryId(CHILD_ID, map);
    expect(fromChildId?.source).toBe("db_overlay");
    expect(fromChildId?.fields.some((f) => f.id === "mileage")).toBe(false);

    const fromRootId = resolveTradeCompositionForCategoryId(ROOT_ID, map);
    expect(fromRootId?.fields.map((f) => f.id)).toEqual(fromChildId?.fields.map((f) => f.id));

    const listAttrs = buildCompositionListAttributes({
      composition: fromChildId!,
      meta: MILEAGE_META,
    });
    expect(listAttrs.some((a) => a.fieldId === "mileage")).toBe(false);

    const detailAttrs = buildCompositionDetailAttributes({
      composition: fromChildId!,
      meta: MILEAGE_META,
    });
    expect(detailAttrs.some((a) => a.fieldId === "mileage")).toBe(false);
  });

  it("child-id listing uses ROOT overlay: mileage ON is visible again", () => {
    const overlay = usedCarOverlayMileage(true);
    const root = cat({
      id: ROOT_ID,
      slug: "vehicle",
      settings: settings(overlay),
    });
    const child = cat({
      id: CHILD_ID,
      parent_id: ROOT_ID,
      slug: "suv",
      settings: settings(null),
    });
    const fromChildId = resolveTradeCompositionForCategoryId(CHILD_ID, byIdOf([root, child]));
    expect(fromChildId?.fields.some((f) => f.id === "mileage")).toBe(true);
    const listAttrs = buildCompositionListAttributes({
      composition: fromChildId!,
      meta: MILEAGE_META,
    });
    expect(listAttrs.some((a) => a.fieldId === "mileage")).toBe(true);
  });

  it("HOME/favorites map: child id returns ROOT field_composition, root id unchanged", () => {
    const overlay = usedCarOverlayMileage(false);
    const root = cat({
      id: ROOT_ID,
      slug: "vehicle",
      show_in_home_chips: true,
      settings: settings(overlay),
    });
    const child = cat({
      id: CHILD_ID,
      parent_id: ROOT_ID,
      slug: "suv",
      show_in_home_chips: false,
      settings: settings(null),
    });
    const props = buildTradeListCompositionMapFromCategories([root, child]);
    expect(props.get(CHILD_ID)?.fieldComposition).toEqual(overlay);
    expect(props.get(ROOT_ID)?.fieldComposition).toEqual(overlay);
    expect(props.get(CHILD_ID)?.categorySlug).toBe("vehicle");
    expect(props.get(ROOT_ID)?.categorySlug).toBe("vehicle");
  });

  it("PostDetailView reads composition from ROOT, not the child row overlay", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    expect(src).toContain("resolveTradeCompositionRootRow");
    expect(src).toContain("compositionRoot");
    expect(src).toContain("compositionOwner.settings?.field_composition");
    expect(src).not.toMatch(
      /TradeCompositionDetailSection[\s\S]*fieldComposition=\{category\?\.settings\?\.field_composition\}/
    );
  });

  it("WRITE still resolves the entry category (root) — A1 does not change persist", () => {
    const write = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"),
      "utf8"
    );
    expect(write).toContain("resolveTradeCompositionForCategory(category)");
    expect(write).not.toContain("resolveTradeCompositionForCategoryId");
  });

  it("category feed still uses in-scope category overlay (root feed)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/post/PostListByCategory.tsx"),
      "utf8"
    );
    expect(src).toContain("category?.settings?.field_composition");
  });

  it("FILTER loader 1-hop child id to ROOT composition (A1/A2 leak fix)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/trade/category-form/load-composition-for-filter.ts"),
      "utf8"
    );
    expect(src).toContain("loadResolvedTradeCompositionByCategoryId");
    expect(src).toContain("selectTradeCompositionOwnerRow");
    expect(src).toContain("parent_id");
    const feed = readFileSync(resolve(process.cwd(), "app/api/trade/feed/route.ts"), "utf8");
    expect(feed).toContain("compositionCategoryId");
    expect(feed).toContain("tradeMarketParent ??");
  });
});
