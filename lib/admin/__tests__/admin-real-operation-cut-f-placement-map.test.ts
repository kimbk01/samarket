import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_REAL_OPERATION_CUT_F_LOCKED,
  CUT_F_PRODUCTION_CARRY,
  PLACEMENT_FLAG_SEPARATION,
  PLACEMENT_MAP_DEFINITION,
  assertAdminRealOperationCutFPlacementMapHardLock,
} from "@/lib/admin/admin-real-operation-cut-f-placement-map-hard-lock";
import {
  assertDeliveryPreviewKeysInRegistry,
  assertInventorySeedsCoverRegistry,
  filterPlacementMapRows,
  listAllPlacementMapRows,
  listDeliveryPlacementMapRows,
  listFeedPlacementMapRows,
  listPopupPlacementMapRows,
  placementMapFocusHref,
  PLACEMENT_MAP_ENTRY,
} from "@/lib/admin/placement-map-read-model";
import { DELIVERY_AD_INVENTORY_KEYS } from "@/lib/stores/advertising/delivery-ad-inventory";
import { DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT } from "@/lib/stores/advertising/delivery-ad-placement-preview";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT F Placement Map", () => {
  it("locks anchors + carry", () => {
    expect(ADMIN_REAL_OPERATION_CUT_F_LOCKED).toBe(true);
    expect(assertAdminRealOperationCutFPlacementMapHardLock()).toBe(true);
    expect(PLACEMENT_MAP_DEFINITION.entry).toBe("/admin/delivery-ads/inventory");
    expect(PLACEMENT_MAP_DEFINITION.newDbForbidden).toBe(true);
    expect(PLACEMENT_FLAG_SEPARATION.searchTopMayBeRuntimeWithoutSellable).toBe(true);
    expect(CUT_F_PRODUCTION_CARRY.tabletPlacementMap).toBe("NOT_PROVEN");
    expect(CUT_F_PRODUCTION_CARRY.popupRuntimeProduction).toBe("NOT_PROVEN");
  });

  it("P1 — Delivery Home map loads placements", () => {
    const rows = filterPlacementMapRows(listAllPlacementMapRows(), {
      domain: "DELIVERY",
      screen: "DELIVERY_HOME",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.screen === "DELIVERY_HOME")).toBe(true);
  });

  it("P2/P3/P4/P5 — known Delivery markers from registry", () => {
    const byId = new Map(listDeliveryPlacementMapRows().map((r) => [r.placementId, r]));
    expect(byId.get("STORES_HOME_HERO")?.flags.defined).toBe(true);
    expect(byId.get("STORES_HOME_FEED")?.flags.defined).toBe(true);
    expect(byId.get("STORES_CATEGORY_FEED")?.flags.defined).toBe(true);
    const search = byId.get("STORES_SEARCH_TOP")!;
    expect(search.flags.defined).toBe(true);
    expect(search.flags.runtimeSupported).toBe(true);
    expect(search.flags.sellable).toBe(false);
  });

  it("P6 — Feed placements under FEED domain", () => {
    const feed = listFeedPlacementMapRows();
    expect(feed.every((r) => r.domain === "FEED")).toBe(true);
    expect(feed.some((r) => r.placementId === "TRADE_HOME")).toBe(true);
    expect(feed.some((r) => r.placementId === "COMMUNITY_HOME")).toBe(true);
  });

  it("P7 — Popup surfaces separate", () => {
    const popup = listPopupPlacementMapRows();
    expect(popup.every((r) => r.domain === "POPUP")).toBe(true);
    expect(popup.length).toBeGreaterThan(0);
  });

  it("P8/P9/P10 — focus href + deep-link wiring", () => {
    expect(placementMapFocusHref("STORES_HOME_HERO")).toBe(
      `${PLACEMENT_MAP_ENTRY}?focus=STORES_HOME_HERO#placement-map`
    );
    expect(read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx")).toContain(
      "placementMapFocusHref"
    );
    expect(read("components/admin/stores/AdminDeliveryAdInventoryManagementView.tsx")).toContain(
      "AdminPlacementMapPanel"
    );
  });

  it("P11/P12 — HOME/CATEGORY → map links", () => {
    expect(read("components/admin/stores/AdminStoresHomeShelvesPage.tsx")).toContain(
      "data-admin-home-placement-map-link"
    );
    expect(read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx")).toContain(
      "data-admin-category-placement-map-link"
    );
  });

  it("P13 — no DB placement merge markers", () => {
    const model = read("lib/admin/placement-map-read-model.ts");
    expect(model).not.toMatch(/CREATE TABLE|placement_map_rows|unified_placement/);
    expect(PLACEMENT_MAP_DEFINITION.domainMergeForbidden).toBe(true);
  });

  it("P14/P15 — no fake count / ratio invent in panel", () => {
    const panel = read("components/admin/stores/AdminPlacementMapPanel.tsx");
    expect(panel).not.toMatch(/fakeActive|activeCount:\s*[1-9]|top:\s*120px/);
    expect(panel).toContain("DeliveryAdPlacementMiniature");
  });

  it("P16/P17 — runtime preview keys ⊆ registry", () => {
    expect(assertDeliveryPreviewKeysInRegistry().ok).toBe(true);
    expect(assertInventorySeedsCoverRegistry().ok).toBe(true);
    for (const key of Object.keys(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners)) {
      expect(DELIVERY_AD_INVENTORY_KEYS as readonly string[]).toContain(key);
    }
  });

  it("P18 — SEARCH_TOP flags stay separated (eligibility presentation)", () => {
    const search = listDeliveryPlacementMapRows().find(
      (r) => r.placementId === "STORES_SEARCH_TOP"
    )!;
    expect(search.flags.sellable).toBe(false);
    expect(search.flags.runtimeSupported).toBe(true);
    expect(search.ratioOwner).toContain("delivery-ad-inventory");
  });

  it("P19 — Popup code path noted; Production carry NOT_PROVEN", () => {
    expect(listPopupPlacementMapRows()[0]?.runtimeConsumer).toMatch(/platform-popup/i);
    expect(CUT_F_PRODUCTION_CARRY.popupRuntimeProduction).toBe("NOT_PROVEN");
  });

  it("P20 — Tablet placement map NOT_PROVEN unless measured", () => {
    expect(CUT_F_PRODUCTION_CARRY.tabletPlacementMap).toBe("NOT_PROVEN");
  });
});
