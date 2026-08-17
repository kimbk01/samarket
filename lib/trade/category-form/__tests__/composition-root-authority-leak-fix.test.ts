import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { TRADE_SEED_COMPOSITIONS } from "@/lib/trade/category-form/composition-seeds";
import {
  resolveCompositionAttributeFilterFields,
  sanitizeCompositionFilterSelection,
} from "@/lib/trade/category-form/composition-filter-query";
import { loadResolvedTradeCompositionByCategoryId } from "@/lib/trade/category-form/load-composition-for-filter";
import {
  resolveTradeCompositionForCategory,
  resolveTradeCompositionForCategoryId,
  resolveTradeCompositionRootRow,
  splitTradeListingAndCompositionOwnerIds,
  withTradeCompositionOwner,
} from "@/lib/trade/category-form/resolve-for-category";

const ROOT_ID = "vehicle-root";
const CHILD_ID = "vehicle-child";

const SIX_TRADE_ROOTS = [
  { id: "r-vehicle", slug: "vehicle", icon_key: "used-car" },
  { id: "r-current", slug: "current", icon_key: "exchange" },
  { id: "r-property", slug: "property", icon_key: "real-estate" },
  { id: "r-hiring", slug: "hiring", icon_key: "jobs" },
  { id: "r-trade", slug: "trade", icon_key: "general" },
  { id: "r-rent", slug: "rent-car", icon_key: "rent-car" },
] as const;

function usedCarOverlayMake(active: boolean) {
  return {
    v: 1 as const,
    fields: TRADE_SEED_COMPOSITIONS["used-car"]!.fields.map((f) =>
      f.id === "make" ? { ...f, active, required: active } : { ...f }
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

function mockSb(
  rows: Record<
    string,
    { parent_id: string | null; icon_key: string; slug: string; field_composition: unknown | null }
  >
) {
  return {
    from() {
      return {
        select() {
          return {
            eq(_col: string, id: string) {
              return {
                async maybeSingle() {
                  const row = rows[id];
                  if (!row) return { data: null, error: null };
                  return {
                    data: {
                      parent_id: row.parent_id,
                      icon_key: row.icon_key,
                      slug: row.slug,
                      category_settings: { field_composition: row.field_composition },
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("A1/A2 composition authority leak fix", () => {
  it("A. root category resolve is unchanged vs direct overlay", () => {
    const overlay = usedCarOverlayMake(false);
    const root = cat({ id: ROOT_ID, slug: "vehicle", settings: settings(overlay) });
    const map = byIdOf([root]);
    const viaId = resolveTradeCompositionForCategoryId(ROOT_ID, map);
    const direct = resolveTradeCompositionForCategory(root);
    expect(viaId?.fields.map((f) => f.id)).toEqual(direct.fields.map((f) => f.id));
    expect(viaId?.fields.some((f) => f.id === "make")).toBe(false);
    const split = splitTradeListingAndCompositionOwnerIds(ROOT_ID, map);
    expect(split).toEqual({ listingCategoryId: ROOT_ID, compositionOwnerId: ROOT_ID });
  });

  it("B. child + root option OFF hides Search filter and Edit option", async () => {
    const root = cat({
      id: ROOT_ID,
      slug: "vehicle",
      settings: settings(usedCarOverlayMake(false)),
    });
    const child = cat({
      id: CHILD_ID,
      parent_id: ROOT_ID,
      slug: "hyundai",
      icon_key: "used-car",
      settings: settings(usedCarOverlayMake(true)),
    });
    const map = byIdOf([root, child]);
    const search = resolveTradeCompositionForCategoryId(CHILD_ID, map);
    expect(search).not.toBeNull();
    const filterIds = resolveCompositionAttributeFilterFields(search!).map((f) => f.id);
    expect(filterIds).not.toContain("make");
    const leaked = resolveTradeCompositionForCategory(child);
    expect(resolveCompositionAttributeFilterFields(leaked).map((f) => f.id)).toContain("make");

    const sanitized = sanitizeCompositionFilterSelection({ make: "hyundai" }, search!);
    expect(sanitized.make).toBeUndefined();

    const form = withTradeCompositionOwner(child, root);
    expect(form.id).toBe(CHILD_ID);
    expect(form.parent_id).toBe(ROOT_ID);
    const edit = resolveTradeCompositionForCategory(form);
    expect(edit.fields.some((f) => f.id === "make")).toBe(false);

    const loaded = await loadResolvedTradeCompositionByCategoryId(
      mockSb({
        [CHILD_ID]: {
          parent_id: ROOT_ID,
          icon_key: "used-car",
          slug: "hyundai",
          field_composition: usedCarOverlayMake(true),
        },
        [ROOT_ID]: {
          parent_id: null,
          icon_key: "used-car",
          slug: "vehicle",
          field_composition: usedCarOverlayMake(false),
        },
      }) as never,
      CHILD_ID
    );
    expect(loaded).not.toBeNull();
    expect(resolveCompositionAttributeFilterFields(loaded!).map((f) => f.id)).not.toContain("make");
  });

  it("C. child + root option ON shows Search filter and Edit option", async () => {
    const root = cat({
      id: ROOT_ID,
      slug: "vehicle",
      settings: settings(usedCarOverlayMake(true)),
    });
    const child = cat({
      id: CHILD_ID,
      parent_id: ROOT_ID,
      slug: "hyundai",
      settings: settings(null),
    });
    const map = byIdOf([root, child]);
    const search = resolveTradeCompositionForCategoryId(CHILD_ID, map)!;
    expect(resolveCompositionAttributeFilterFields(search).map((f) => f.id)).toContain("make");
    const form = withTradeCompositionOwner(child, root);
    expect(resolveTradeCompositionForCategory(form).fields.some((f) => f.id === "make")).toBe(true);

    const loaded = await loadResolvedTradeCompositionByCategoryId(
      mockSb({
        [CHILD_ID]: {
          parent_id: ROOT_ID,
          icon_key: "used-car",
          slug: "hyundai",
          field_composition: null,
        },
        [ROOT_ID]: {
          parent_id: null,
          icon_key: "used-car",
          slug: "vehicle",
          field_composition: usedCarOverlayMake(true),
        },
      }) as never,
      CHILD_ID
    );
    expect(resolveCompositionAttributeFilterFields(loaded!).map((f) => f.id)).toContain("make");
  });

  it("D. child listing id stays child; composition owner is root", () => {
    const root = cat({ id: ROOT_ID, slug: "vehicle" });
    const child = cat({ id: CHILD_ID, parent_id: ROOT_ID, slug: "hyundai" });
    const split = splitTradeListingAndCompositionOwnerIds(CHILD_ID, byIdOf([root, child]));
    expect(split.listingCategoryId).toBe(CHILD_ID);
    expect(split.compositionOwnerId).toBe(ROOT_ID);
    expect(split.listingCategoryId).not.toBe(split.compositionOwnerId);

    const searchView = readFileSync(resolve(process.cwd(), "components/search/SearchView.tsx"), "utf8");
    expect(searchView).toContain("splitTradeListingAndCompositionOwnerIds");
    expect(searchView).toContain("tradeMarketParentId: listingAndComposition.listingCategoryId");
    expect(searchView).not.toMatch(/tradeMarketParentId:\s*listingAndComposition\.compositionOwnerId/);
  });

  it("E. six production trade roots: listing === composition owner", () => {
    const rows = SIX_TRADE_ROOTS.map((r) =>
      cat({ id: r.id, slug: r.slug, icon_key: r.icon_key, parent_id: null })
    );
    const map = byIdOf(rows);
    for (const r of SIX_TRADE_ROOTS) {
      expect(resolveTradeCompositionRootRow(r.id, map)?.id).toBe(r.id);
      const split = splitTradeListingAndCompositionOwnerIds(r.id, map);
      expect(split.listingCategoryId).toBe(r.id);
      expect(split.compositionOwnerId).toBe(r.id);
      expect(resolveTradeCompositionForCategoryId(r.id, map)?.profileId).toBeTruthy();
    }
  });

  it("wires SearchFilterBar and Edit client to root composition helpers", () => {
    const bar = readFileSync(resolve(process.cwd(), "components/search/SearchFilterBar.tsx"), "utf8");
    expect(bar).toContain("resolveTradeCompositionForCategoryId");
    expect(bar).not.toContain("resolveTradeCompositionForCategory(");

    const edit = readFileSync(
      resolve(process.cwd(), "components/products/ProductTradeEditPageClient.tsx"),
      "utf8"
    );
    expect(edit).toContain("withTradeCompositionOwner");
    expect(edit).toContain("getCategoryBySlugOrId(parentId)");
    expect(edit).toContain("TradeCategoryWriteForm");
  });
});
