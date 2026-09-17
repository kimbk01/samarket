import { describe, expect, it } from "vitest";
import { buildDeliveryServiceAreaEditorPayload } from "@/lib/delivery/service-area/build-service-area-editor-payload";
import {
  classifyDeliveryRegionalListBand,
  formatApproxDeliveryDistanceKm,
  resolveDeliveryRegionalListSelectedIds,
} from "@/lib/delivery/service-area/regional-list-presentation";
import type { StoreDeliveryServiceAreaRow } from "@/lib/delivery/service-area/store-delivery-service-areas";

describe("regional list presentation bands (T1–T5)", () => {
  const R = 10;
  const S = 20;

  it("T1: 5km → base", () => {
    expect(classifyDeliveryRegionalListBand(5, R, S)).toBe("base");
  });

  it("T2: ~9.9km → base (inclusive rounding)", () => {
    expect(classifyDeliveryRegionalListBand(9.94, R, S)).toBe("base");
  });

  it("T3: 13km → extended", () => {
    expect(classifyDeliveryRegionalListBand(13, R, S)).toBe("extended");
  });

  it("T4: 19.x km → extended", () => {
    expect(classifyDeliveryRegionalListBand(19.4, R, S)).toBe("extended");
  });

  it("T5: outside ≈R+10 → outside", () => {
    expect(classifyDeliveryRegionalListBand(21, R, S)).toBe("outside");
  });

  it("approx distance uses whole km guidance", () => {
    expect(formatApproxDeliveryDistanceKm(6.137)).toBe(6);
    expect(formatApproxDeliveryDistanceKm(9.842)).toBe(10);
  });
});

describe("initial vs confirmed selection (T6–T8)", () => {
  it("T1/T2 initial: base candidates default selected; extended unselected", () => {
    const rows = [
      { geoIdentity: "home", isStoreHome: true, isWithinBaseRange: true },
      { geoIdentity: "near", isStoreHome: false, isWithinBaseRange: true },
      { geoIdentity: "mid", isStoreHome: false, isWithinBaseRange: false },
    ];
    const r = resolveDeliveryRegionalListSelectedIds({
      authorityMode: "legacy_radius",
      savedSelectedIds: [],
      candidateRows: rows,
    });
    expect(r.selectionSource).toBe("initial_base_default");
    expect([...r.selectedIds].sort()).toEqual(["home", "near"]);
    expect(r.selectedIds.has("mid")).toBe(false);
  });

  it("T7: confirmed/saved override — removed base stays unselected", () => {
    const rows = [
      { geoIdentity: "home", isStoreHome: true, isWithinBaseRange: true },
      { geoIdentity: "near", isStoreHome: false, isWithinBaseRange: true },
    ];
    const r = resolveDeliveryRegionalListSelectedIds({
      authorityMode: "v2_lgu",
      savedSelectedIds: ["home"],
      candidateRows: rows,
    });
    expect(r.selectionSource).toBe("saved");
    expect([...r.selectedIds]).toEqual(["home"]);
    expect(r.selectedIds.has("near")).toBe(false);
  });

  it("T8: R change with confirmed V2 preserves saved IDs (no silent base re-select)", () => {
    const rowsAfterRChange = [
      { geoIdentity: "home", isStoreHome: true, isWithinBaseRange: true },
      { geoIdentity: "newly-in-base", isStoreHome: false, isWithinBaseRange: true },
      { geoIdentity: "extended", isStoreHome: false, isWithinBaseRange: false },
    ];
    const r = resolveDeliveryRegionalListSelectedIds({
      authorityMode: "v2_lgu",
      savedSelectedIds: ["home", "extended"],
      candidateRows: rowsAfterRChange,
    });
    expect([...r.selectedIds].sort()).toEqual(["extended", "home"]);
    expect(r.selectedIds.has("newly-in-base")).toBe(false);
  });
});

describe("editor payload regional list UX", () => {
  const store = {
    city: "Quezon City",
    region: "Metro Manila",
    lat: 14.676,
    lng: 121.0437,
    delivery_radius_km: 10,
    delivery_service_area_authority: "legacy_radius",
    store_name: "UX Store",
  };

  it("T1–T4: payload marks base/extended bands and initial base select", () => {
    const empty = buildDeliveryServiceAreaEditorPayload(store, []);
    expect(empty.selectionSource).toBe("initial_base_default");
    expect(empty.referenceDistanceKm).toBe(10);
    expect(empty.candidateSearchKm).toBe(20);
    const home = empty.candidates.find((c) => c.isStoreHome);
    expect(home?.selected).toBe(true);
    expect(home?.isWithinBaseRange).toBe(true);
    for (const c of empty.candidates) {
      if (c.isWithinBaseRange || c.isStoreHome) expect(c.selected).toBe(true);
      if (c.isWithinExtendedRange) expect(c.selected).toBe(false);
    }
    const extended = empty.candidates.filter((c) => c.isWithinExtendedRange);
    expect(extended.length).toBeGreaterThan(0);
  });

  it("T6/T9: saved extended + far manual remain selected; T8 no silent add", () => {
    const selected: StoreDeliveryServiceAreaRow[] = [
      {
        geoIdentity: "1381300000",
        areaType: "city_municipality",
        displayNameSnapshot: "Quezon City",
        source: "owner",
        isStoreHome: true,
      },
      {
        geoIdentity: "far-manual",
        areaType: "city_municipality",
        displayNameSnapshot: "Cebu City",
        source: "owner",
        isStoreHome: false,
      },
    ];
    const v2Store = { ...store, delivery_service_area_authority: "v2_lgu" };
    const payload = buildDeliveryServiceAreaEditorPayload(v2Store, selected);
    expect(payload.selectionSource).toBe("saved");
    expect(payload.selectedGeoIdentities).toEqual(["1381300000", "far-manual"].sort());
    const newlyBase = payload.candidates.filter(
      (c) => c.isWithinBaseRange && c.geoIdentity !== "1381300000"
    );
    for (const c of newlyBase) {
      expect(c.selected).toBe(false);
    }
    expect(payload.selectedGeoIdentities).toContain("far-manual");
  });

  it("T10: Owner/Admin payload identity", () => {
    const selected: StoreDeliveryServiceAreaRow[] = [
      {
        geoIdentity: "1381300000",
        areaType: "city_municipality",
        displayNameSnapshot: "Quezon City",
        source: "owner",
        isStoreHome: true,
      },
    ];
    const owner = buildDeliveryServiceAreaEditorPayload(store, selected);
    const admin = buildDeliveryServiceAreaEditorPayload(store, selected);
    expect(owner.selectedGeoIdentities).toEqual(admin.selectedGeoIdentities);
    expect(owner.candidates.map((c) => c.geoIdentity)).toEqual(
      admin.candidates.map((c) => c.geoIdentity)
    );
    expect(owner.candidates.map((c) => c.isWithinBaseRange)).toEqual(
      admin.candidates.map((c) => c.isWithinBaseRange)
    );
  });
});
