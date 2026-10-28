/**
 * 2026-10-28 배달 감사 §F — 샘플(체험용) 매장 운영 계약 S-1~S-7.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveListDistanceOutOfRange,
  shouldExcludeOutOfRangeFromNormalList,
} from "@/lib/delivery/delivery-list-oor-policy";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { isStorePublicMenuOpen } from "@/lib/stores/store-public-menu-open";
import { storeOrderBlockMessageKey } from "@/lib/stores/store-order-block-message";
import { resolveStoreListCardBadges } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import {
  matchesAdminStoreClassFilters,
  parseAdminStoreClassFilters,
} from "@/lib/admin-business/admin-store-class-filters";
import {
  ADMIN_SAMPLE_CATALOG_WRITE_POLICY,
  OWNER_CATALOG_WRITE_POLICY,
} from "@/lib/stores/catalog/store-catalog-write-policy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("S-3 sample stores are not subject to the delivery-area exclusion (single list policy)", () => {
  it("saved-address member: real store without coords is excluded, sample store is not", () => {
    const real = resolveListDistanceOutOfRange({
      originSource: "saved_address",
      serviceabilityApplies: true,
      reason: "missing_store_coords",
      storeKind: "real",
    });
    const sample = resolveListDistanceOutOfRange({
      originSource: "saved_address",
      serviceabilityApplies: true,
      reason: "missing_store_coords",
      storeKind: "sample",
    });
    expect(real).toBe(true);
    expect(sample).toBe(false);
    expect(shouldExcludeOutOfRangeFromNormalList({ originSource: "saved_address", distanceOutOfRange: sample })).toBe(false);
  });

  it("all list callers pass store_kind from the same row (no extra lookup)", () => {
    for (const f of [
      "lib/stores/stores-browse-build.ts",
      "lib/stores/discovery/resolve-discovery-oor-with-service-area.ts",
      "app/api/stores/home-feed/route.ts",
      "lib/delivery/search/search-delivery.ts",
    ]) {
      expect(read(f), f).toMatch(/storeKind: /);
    }
    expect(read("lib/stores/stores-browse-build.ts")).toContain("first_listed_at,store_kind");
    expect(read("lib/stores/store-discovery-candidate.ts")).toContain("  store_kind,");
    expect(read("lib/stores/advertising/banner-viewer-serviceability.ts")).toContain("delivery_radius_km, store_kind");
  });

  it("P-4 search candidates match browse (approved + visible, no delivery-only filter)", () => {
    const src = read("lib/delivery/search/search-delivery.ts");
    expect(src).not.toMatch(/\.eq\("delivery_available", true\)/);
    expect(src).not.toMatch(/\.eq\("local_delivery_available", true\)/);
  });
});

describe("S-4 one orderability reason for UI, checkout and cart", () => {
  it("sample store is never orderable, even for admins, with reason sample_store", async () => {
    const res = await resolveStoreOrderability({} as never, "viewer-1", null, "sample");
    expect(res).toEqual({
      viewer_is_owner: false,
      viewer_is_admin: false,
      can_order_store: false,
      owner_block_message: null,
      block_reason: "sample_store",
    });
    const real = await resolveStoreOrderability({} as never, null, "owner-1", "real");
    expect(real.can_order_store).toBe(true);
    expect(real.block_reason).toBeNull();
  });

  it("checkout returns store_sample_no_order before other gates; client maps it", () => {
    expect(read("lib/stores/validate-store-order-checkout.ts")).toContain('error: "store_sample_no_order"');
    expect(read("lib/stores/resolve-store-checkout-client-error.ts")).toContain('store_sample_no_order: "store_sample_order_block"');
    expect(storeOrderBlockMessageKey("sample_store")).toBe("store_sample_order_block");
    expect(storeOrderBlockMessageKey("own_store")).toBe("store_err_own_store_block");
  });

  it("menu open = sales approved OR sample; TS and SQL definitions match", () => {
    expect(isStorePublicMenuOpen({ perm: { allowed_to_sell: true, sales_status: "approved" }, storeKind: "real" })).toBe(true);
    expect(isStorePublicMenuOpen({ perm: { allowed_to_sell: false, sales_status: "pending" }, storeKind: "real" })).toBe(false);
    expect(isStorePublicMenuOpen({ perm: { allowed_to_sell: false, sales_status: "pending" }, storeKind: "sample" })).toBe(true);
    const sql = read("supabase/migrations/20270707130100_store_public_menu_open_sample.sql");
    expect(sql).toContain("sp.allowed_to_sell = true AND sp.sales_status = 'approved'");
    expect(sql).toContain("s.store_kind = 'sample'");
    expect(sql).toContain("public.store_public_menu_open(sr.id) AS can_sell");
  });

  it("DB: sample cannot be sales-approved (order RPC refuses store_not_selling); RPC body untouched", () => {
    const sql = read("supabase/migrations/20270707130000_stores_store_kind_sample_operations.sql");
    expect(sql).toContain("sample_store_cannot_sell");
    expect(sql).not.toContain("FUNCTION public.create_store_order_atomic");
  });

  it("inquiries are refused for sample stores", () => {
    expect(read("app/api/stores/[slug]/inquiries/route.ts")).toContain('"sample_store_no_inquiry"');
  });
});

describe("S-1/S-2 store_kind classification and owner model", () => {
  it("only sample stores may have no owner (DB CHECK)", () => {
    const sql = read("supabase/migrations/20270707130000_stores_store_kind_sample_operations.sql");
    expect(sql).toContain("(store_kind = 'sample' AND owner_user_id IS NULL)");
    expect(sql).toContain("(store_kind <> 'sample' AND owner_user_id IS NOT NULL)");
  });

  it("legacy test stores cannot be re-exposed without reclassification", () => {
    const src = read("app/api/admin/stores/[id]/route.ts");
    expect(src).toContain('"legacy_test_store_not_exposable"');
    expect(src).toContain('if (action === "set_store_kind")');
  });

  it("resume_store restores approval but not exposure for legacy test stores", () => {
    const src = read("app/api/admin/stores/[id]/route.ts");
    const resume = src.slice(src.indexOf('} else if (action === "resume_store")'));
    expect(resume.slice(0, 600)).toContain("isLegacyTest ? { is_visible: false } : buildStoreVisibilityWritePatch(true)");
  });

  it("admin list filters: kind, category, visibility are independent axes", () => {
    const f = parseAdminStoreClassFilters(
      new URLSearchParams("kind=sample&visibility=hidden&category=85bc854d-c282-4fe0-8eb7-bf04f5240280")
    );
    expect(f).toEqual({ kind: "sample", visibility: "hidden", categoryId: "85bc854d-c282-4fe0-8eb7-bf04f5240280" });
    expect(matchesAdminStoreClassFilters({ store_kind: "sample", is_visible: false, store_category_id: f.categoryId }, f)).toBe(true);
    expect(matchesAdminStoreClassFilters({ store_kind: "sample", is_visible: true, store_category_id: f.categoryId }, f)).toBe(false);
    expect(parseAdminStoreClassFilters(new URLSearchParams("kind=evil&category=x")).kind).toBeNull();
  });
});

describe("S-5 admin sample catalog reuses the owner catalog core", () => {
  it("admin sample routes call the same core functions with the admin sample policy", () => {
    const create = read("app/api/admin/stores/samples/[id]/products/route.ts");
    expect(create).toContain("createStoreProduct(sb, sid, body, { uiLang, policy: ADMIN_SAMPLE_CATALOG_WRITE_POLICY })");
    const update = read("app/api/admin/stores/samples/[id]/products/[productId]/route.ts");
    expect(update).toContain("updateStoreProduct(");
    expect(update).toContain("ADMIN_SAMPLE_CATALOG_WRITE_POLICY");
    expect(read("app/api/admin/stores/samples/[id]/upload-image/route.ts")).toContain("prepareStoreProductImageUpload");
    for (const f of [
      "app/api/admin/stores/samples/[id]/products/route.ts",
      "app/api/admin/stores/samples/[id]/products/[productId]/route.ts",
      "app/api/admin/stores/samples/[id]/menu-sections/route.ts",
      "app/api/admin/stores/samples/[id]/menu-sections/[sectionId]/route.ts",
      "app/api/admin/stores/samples/[id]/upload-image/route.ts",
    ]) {
      expect(read(f), f).toContain("requireAdminSampleStore(sb, sid)");
    }
  });

  it("policies differ only in actor rules", () => {
    expect(OWNER_CATALOG_WRITE_POLICY.requireSalesPermissionForActive).toBe(true);
    expect(ADMIN_SAMPLE_CATALOG_WRITE_POLICY.requireSalesPermissionForActive).toBe(false);
    expect(ADMIN_SAMPLE_CATALOG_WRITE_POLICY.manualSoldOutReason).toBe("admin");
  });
});

describe("S-6 sample ads derive from the destination store; stats skip them in DB", () => {
  it("label comes from destination store_kind, not an ad flag", () => {
    expect(read("lib/stores/advertising/load-banner-store-eligibility.ts")).toContain('store_kind === "sample"');
    expect(read("components/stores/home/hub/StoresHomeHeroBanner.tsx")).toContain('slide.isSampleAd ? "store_insertion_sample_ad"');
    const sql = read("supabase/migrations/20270707130000_stores_store_kind_sample_operations.sql");
    expect(sql).toContain("BEFORE INSERT ON public.delivery_ad_impression_events");
    expect(sql).toContain("BEFORE INSERT ON public.delivery_ad_click_events");
  });
});

describe("S-7 all-samples visibility = bulk is_visible (single exposure source)", () => {
  it("bulk route writes is_visible on sample stores only", () => {
    const src = read("lib/stores/sample/admin-sample-store.server.ts");
    expect(src).toContain('.update(buildStoreVisibilityWritePatch(visible))\n    .eq("store_kind", "sample")');
  });
});

describe("card badge", () => {
  it("sample badge first, free-delivery suppressed", () => {
    const b = resolveStoreListCardBadges({
      statusLabel: "영업중",
      statusClassName: "x",
      isFeatured: false,
      recommendedLabel: "추천",
      pickupAvailable: false,
      pickupLabel: "픽업",
      freeDeliveryProven: true,
      freeDeliveryLabel: "무료배달",
      outOfRangeLabel: null,
      sampleLabel: "샘플 매장",
    });
    expect(b[0]!.kind).toBe("sample");
    expect(b.some((x) => x.kind === "free_delivery")).toBe(false);
  });
});
