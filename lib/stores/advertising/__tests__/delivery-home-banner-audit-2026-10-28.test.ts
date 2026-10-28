/**
 * 2026-10-28 배달 감사 §F — 배너·HOME 결함 H-02·H-03·H-04·H-05·H-07·H-08·H-10·H-12 계약.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("H-02/H-10 home banners follow the home hub lifecycle", () => {
  it("hub bumps one banner token on pull-to-refresh, address change and resume, and passes it to both banners", () => {
    const hub = read("components/stores/home/hub/StoresHomeHub.tsx");
    expect(hub).toContain("<StoresHomeHeroBanner refreshToken={homeBannerRefreshToken} />");
    expect(hub.match(/<StoresHomeBeforeRestBanner refreshToken=\{homeBannerRefreshToken\} \/>/g)?.length).toBe(2);
    expect(hub.match(/bumpHomeBanners\(\);/g)?.length).toBe(3);
  });

  it("both banners refetch on token change and keep the previous slides when a refetch fails", () => {
    for (const f of [
      "components/stores/home/hub/StoresHomeHeroBanner.tsx",
      "components/stores/home/hub/StoresHomeBeforeRestBanner.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toContain("}, [refreshToken]);");
      expect(src, f).toContain("setBanners((prev) => prev ?? [])");
    }
  });

  it("hero reserves the 140px loading box only when the last known result had slides", () => {
    const src = read("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    expect(src).toContain("let lastKnownHeroSlideCount: number | null = null;");
    expect(src).toContain("lastKnownHeroSlideCount === 0 || lastKnownHeroSlideCount === null");
  });
});

describe("H-03 new banners append to their surface order (single DB authority)", () => {
  it("insert trigger assigns max+1 per surface and the first-party writer no longer hardcodes 0", () => {
    const sql = read("supabase/migrations/20270707120100_banner_campaign_sort_order_append_h03.sql");
    expect(sql).toContain("BEFORE INSERT ON public.store_banner_ad_campaigns");
    expect(sql).toContain("coalesce(max(c.sort_order), -1) + 1");
    expect(read("lib/stores/advertising/delivery-ad-admin-first-party-writer.ts")).not.toContain("sort_order: 0");
  });
});

describe("H-04 hero slide order is one transaction", () => {
  it("writer calls reorder_store_banner_hero_slides once and validates input", async () => {
    const { reorderDeliveryHeroBannerSlides } = await import("@/lib/admin/ads-exposure/reorder-hero-banners");
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const sb = { rpc } as never;
    expect(await reorderDeliveryHeroBannerSlides(sb, { adminUserId: "a", orderedCampaignIds: [] })).toEqual({
      ok: false,
      error: "empty_order",
    });
    expect(
      await reorderDeliveryHeroBannerSlides(sb, { adminUserId: "a", orderedCampaignIds: ["x", "x"] })
    ).toEqual({ ok: false, error: "duplicate_ids" });
    expect(await reorderDeliveryHeroBannerSlides(sb, { adminUserId: "a", orderedCampaignIds: ["x", "y"] })).toEqual({
      ok: true,
      orderedIds: ["x", "y"],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reorder_store_banner_hero_slides", {
      p_admin_user_id: "a",
      p_ordered_ids: ["x", "y"],
    });
  });

  it("RPC rejects non-hero ids and renumbers the rest after the listed ids", () => {
    const sql = read("supabase/migrations/20270707120200_reorder_hero_banner_slides_atomic_h04.sql");
    expect(sql).toContain("'campaign_not_hero'");
    expect(sql).toContain("v_n - 1 + row_number()");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reorder_store_banner_hero_slides(uuid, uuid[]) TO service_role;");
  });
});

describe("H-07 before-rest banner toggle changes enabled only", () => {
  it("no order realign, business permission", () => {
    const src = read("app/api/admin/stores-home-before-rest-banner/route.ts");
    expect(src).not.toContain("getCanonicalCompositionRows");
    expect(src).toContain('requireAdminPermission("business")');
  });
});

describe("H-08 HOME shelves save = one CAS RPC", () => {
  it("route no longer upserts shelf fields outside CAS", () => {
    const src = read("app/api/admin/stores-home-shelves/route.ts");
    expect(src).not.toContain("upsertHomeShelfProductFields");
    expect(src).toContain("buildHomeShelfProductDbFieldsBySlot(productOverrides)");
  });

  it("CAS payload carries product fields per slot", async () => {
    const { upsertCompositionPolicyOverridesWithCas } = await import(
      "@/lib/stores/composition/stores-composition-policy-db"
    );
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, revision: 8 }, error: null });
    const res = await upsertCompositionPolicyOverridesWithCas(
      { rpc } as never,
      "home",
      [
        { surface: "home", slot: "slot2Food", contentType: "food_product", enabled: true, order: 0, max: 6, interval: { consumed: false, reason: "NOT_CONSUMED" } },
        { surface: "home", slot: "homeCouponInsertion", contentType: "food_product", enabled: true, order: 12, max: 5, interval: { consumed: false, reason: "NOT_CONSUMED" } },
      ] as never,
      { userId: "u", nickname: "u" },
      7,
      new Map([["slot2Food", { shelf_id: "popular_menu", title_ko: "주문이 많은 매장" }]])
    );
    expect(res).toEqual({ ok: true, revision: 8 });
    const rows = rpc.mock.calls[0]![1].p_rows as Array<Record<string, unknown>>;
    expect(rows[0]!.product).toEqual({ shelf_id: "popular_menu", title_ko: "주문이 많은 매장" });
    expect("product" in rows[1]!).toBe(false);
  });

  it("migration writes product columns inside the same UPDATE/INSERT, signature unchanged", () => {
    const sql = read("supabase/migrations/20270707120000_home_shelves_single_cas_save_h08.sql");
    expect(sql).toContain("public.save_store_composition_policy_surface_cas(\n  p_surface text,\n  p_expected_revision bigint,\n  p_rows jsonb,");
    expect(sql).toContain("title_ko = CASE WHEN v_has_product");
  });
});

describe("H-05 admin sees the customer slot gate", () => {
  it("slot status reuses the runtime gate functions", () => {
    const src = read("lib/stores/advertising/banner-slot-exposure-status.ts");
    expect(src).toContain("homeBannerBeforeRestPolicyEnabled(home.rows)");
    expect(src).toContain("resolveBrowseScopePolicy({");
    expect(src).toContain(".bannerAds.enabled");
  });

  it("Stage 2 pixel guides come from the Stage 2 geometry contract", async () => {
    const { bannerPixelGuideForInventory } = await import("@/lib/stores/advertising/delivery-ad-open-event-commercial");
    const { STAGE2_HOME_BEFORE_REST_GEOMETRY, STAGE2_BROWSE_TOP_GEOMETRY } = await import(
      "@/lib/stores/advertising/delivery-ad-stage2-surface-contract"
    );
    expect(bannerPixelGuideForInventory("STORES_HOME_INLINE_1")?.minWidth).toBe(STAGE2_HOME_BEFORE_REST_GEOMETRY.minimumWidth);
    expect(bannerPixelGuideForInventory("STORES_CATEGORY_TOP")?.ratioLabel).toBe(STAGE2_BROWSE_TOP_GEOMETRY.ratioLabel);
  });
});

describe("H-12 capacity single authority", () => {
  it("DB mirror aligned to code capacity max", async () => {
    const { BANNER_PLACEMENT_CAPACITY_SSOT } = await import("@/lib/ads/banner-placement-capacity-ssot");
    const sql = read("supabase/migrations/20270707120300_delivery_ad_inventory_capacity_align_h12.sql");
    expect(sql).toContain(`SET max_active_campaigns = ${BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.max},`);
    expect(sql).toContain(`max_active_campaigns = ${BANNER_PLACEMENT_CAPACITY_SSOT.STORES_CATEGORY_TOP.max}, updated_at = now()\nWHERE key = 'STORES_CATEGORY_TOP'`);
  });
});

describe("first-party-only placements show human names (never raw inventory keys)", () => {
  it("INLINE_1 and CATEGORY_TOP have admin labels without joining the paid placement allow-list", async () => {
    const { adminDeliveryAdInventoryHumanLabel } = await import("@/lib/stores/advertising/delivery-ad-admin-r3-presentation");
    const { isDeliveryAdCommercialPlacementKey } = await import("@/lib/stores/advertising/delivery-ad-commercial-labels");
    const { ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS } = await import("@/lib/stores/advertising/admin-first-party-banner-inventory");
    for (const k of ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS) {
      expect(adminDeliveryAdInventoryHumanLabel(k, "ko")).not.toBe(k);
      expect(adminDeliveryAdInventoryHumanLabel(k, "en")).not.toBe(k);
    }
    expect(isDeliveryAdCommercialPlacementKey("STORES_HOME_INLINE_1")).toBe(false);
    expect(isDeliveryAdCommercialPlacementKey("STORES_CATEGORY_TOP")).toBe(false);
  });
});
