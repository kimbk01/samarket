import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminSurfaceBadgeChars,
  buildAdminCompositionSurfaceMatrix,
} from "@/lib/trade/category-form/admin-composition-surface-matrix";

describe("admin composition surface matrix (Phase 4)", () => {
  it("seed rent-car matrix has write/list/detail/edit counts > 0", () => {
    const m = buildAdminCompositionSurfaceMatrix({ iconKey: "rent-car", fieldComposition: null });
    expect(m.profileId).toBe("rent-car");
    expect(m.layoutVariant).toBe("rental-card");
    expect(m.source).toBe("product_seed");
    expect(m.counts.write).toBeGreaterThan(0);
    expect(m.counts.list).toBeGreaterThan(0);
    expect(m.counts.detail).toBeGreaterThan(0);
    expect(m.counts.edit).toBeGreaterThan(0);
    expect(adminSurfaceBadgeChars(m.fieldSurfaces.daily_price)).toMatch(/W/);
    expect(adminSurfaceBadgeChars(m.fieldSurfaces.daily_price)).toMatch(/L/);
  });

  it("Admin overlay deactivating list field shrinks list count", () => {
    const seed = buildAdminCompositionSurfaceMatrix({ iconKey: "used-car", fieldComposition: null });
    const mileageOnList = seed.counts.list;
    const overlay = {
      v: 1 as const,
      fields: [
        { id: "make", active: true, required: true, order: 1 },
        { id: "model", active: true, required: true, order: 2 },
        { id: "year", active: true, required: true, order: 3 },
        { id: "mileage", active: false, required: false, order: 4 },
        { id: "price", active: true, required: true, order: 5 },
      ],
    };
    const m = buildAdminCompositionSurfaceMatrix({
      iconKey: "used-car",
      fieldComposition: overlay,
    });
    expect(m.source).toBe("db_overlay");
    expect(m.counts.list).toBeLessThan(mileageOnList);
    expect(m.fieldSurfaces.mileage).toBeUndefined();
  });

  it("CategoryFieldCompositionEditor wires matrix helper and CategoryFormModal mounts editor", () => {
    const editor = readFileSync(
      resolve(process.cwd(), "components/admin/categories/CategoryFieldCompositionEditor.tsx"),
      "utf8"
    );
    const modal = readFileSync(
      resolve(process.cwd(), "components/admin/categories/CategoryFormModal.tsx"),
      "utf8"
    );
    expect(editor).toContain("buildAdminCompositionSurfaceMatrix");
    expect(editor).toContain("admin_cat_composition_matrix_title");
    expect(modal).toContain("CategoryFieldCompositionEditor");
    expect(modal).toContain("field_composition");
  });

  it("WRITE/LIST/DETAIL consumers still accept field_composition (wire lock)", () => {
    const write = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"),
      "utf8"
    );
    const list = readFileSync(resolve(process.cwd(), "components/post/PostListByCategory.tsx"), "utf8");
    const home = readFileSync(resolve(process.cwd(), "components/home/HomeProductList.tsx"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "components/post/PostDetailView.tsx"), "utf8");
    expect(write).toContain("resolveTradeCompositionForCategory");
    expect(list).toContain("field_composition");
    expect(home).toContain("useTradeListCompositionMap");
    expect(detail).toContain("field_composition");
    expect(detail).toContain('iconKey="jobs"');
  });
});
