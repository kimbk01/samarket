import { describe, expect, it } from "vitest";
import { buildPlacementMapExecutionSnapshot } from "@/lib/admin/placement-map-execution-snapshot";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";

describe("placement map ACTIVE execution snapshot (CUT I)", () => {
  it("deep-link includes execution campaign id", () => {
    const href = placementMapFocusHref("STORES_HOME_FEED", {
      campaignId: "camp-1",
    });
    expect(href).toContain("focus=STORES_HOME_FEED");
    expect(href).toContain("execution=camp-1");
    expect(href).toContain("#placement-map");
  });

  it("sponsored ACTIVE+FUNDED in-window → campaignGate ok", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    const snap = buildPlacementMapExecutionSnapshot({
      campaign: {
        id: "c1",
        productKind: "store_sponsored",
        storeId: "s1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        inventoryKeys: ["STORES_HOME_FEED"],
        creativeId: "cr1",
        imageUrl: "https://example.com/a.jpg",
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-07-01T00:00:00.000Z",
        campaignSource: "OWNER_PAID",
      },
      fundingStatus: "FUNDED",
      focusPlacementId: "STORES_HOME_FEED",
      nowMs: now,
    });
    expect(snap.campaignGateOk).toBe(true);
    expect(snap.scheduleActive).toBe(true);
    expect(snap.placementEnabled).toBe(true);
    expect(snap.notes.some((n) => n.includes("store_eligible"))).toBe(true);
  });

  it("UNFUNDED owner paid → funding_ready block", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    const snap = buildPlacementMapExecutionSnapshot({
      campaign: {
        id: "c2",
        productKind: "store_sponsored",
        storeId: "s1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        inventoryKeys: ["STORES_CATEGORY_FEED"],
        creativeId: null,
        imageUrl: "https://example.com/a.jpg",
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-07-01T00:00:00.000Z",
        campaignSource: "OWNER_PAID",
      },
      fundingStatus: "UNFUNDED",
      nowMs: now,
    });
    expect(snap.campaignGateOk).toBe(false);
    expect(snap.campaignGateReasons).toContain("funding_ready");
  });
});
