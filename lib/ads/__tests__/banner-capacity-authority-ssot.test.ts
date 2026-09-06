import { describe, expect, it } from "vitest";
import {
  BANNER_PLACEMENT_CAPACITY_SSOT,
  BANNER_ROTATION_UNSUPPORTED,
  bannerPlacementDefaultCapacity,
} from "@/lib/ads/banner-placement-capacity-ssot";
import {
  computePlacementOccupancy,
  countPlacementOverlapInWindow,
} from "@/lib/admin/ads-operator/placement-occupancy";
import { isAdminAuthorityCtaAllowed } from "@/lib/ads/admin-authority-matrix";
import { LAUNCH_BANNER_PLACEMENTS } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";

describe("HERO capacity / rotation / authority SSOT", () => {
  it("closes HERO occupancy default ≠ carousel first divergence", () => {
    expect(bannerPlacementDefaultCapacity("STORES_HOME_HERO")).toBe(5);
    expect(BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.defaultCapacity).toBe(5);
    expect(BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.visibleAtOnce).toBe(1);
    expect(BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.rotationIntervalMs).toBe(
      LAUNCH_BANNER_PLACEMENTS[0]?.autoSlideMs
    );
    expect(BANNER_ROTATION_UNSUPPORTED).toContain("weighted");
    expect(BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.houseAdUiAllowed).toBe(false);
  });

  it("occupancy reports capacity 5 for HERO with 3 live → vacant 2", () => {
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const rows = computePlacementOccupancy(
      [
        {
          id: "a",
          storeId: "s1",
          storeName: "A",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-01T00:00:00.000Z",
          endAt: "2026-09-10T00:00:00.000Z",
        },
        {
          id: "b",
          storeId: "s2",
          storeName: "B",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-03T00:00:00.000Z",
          endAt: "2026-09-12T00:00:00.000Z",
        },
        {
          id: "c",
          storeId: "s3",
          storeName: "C",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-05T00:00:00.000Z",
          endAt: "2026-09-15T00:00:00.000Z",
        },
      ],
      { nowMs: now, placementKeys: ["STORES_HOME_HERO"] }
    );
    expect(rows[0]?.capacity).toBe(5);
    expect(rows[0]?.liveCount).toBe(3);
    expect(rows[0]?.vacant).toBe(2);
  });

  it("period overlap marks full when capacity reached", () => {
    const r = countPlacementOverlapInWindow(
      [
        {
          id: "a",
          storeId: "s1",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-01T00:00:00.000Z",
          endAt: "2026-09-10T00:00:00.000Z",
        },
        {
          id: "b",
          storeId: "s2",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-03T00:00:00.000Z",
          endAt: "2026-09-12T00:00:00.000Z",
        },
        {
          id: "c",
          storeId: "s3",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "SCHEDULED",
          startAt: "2026-09-05T00:00:00.000Z",
          endAt: "2026-09-15T00:00:00.000Z",
        },
        {
          id: "d",
          storeId: "s4",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-06T00:00:00.000Z",
          endAt: "2026-09-20T00:00:00.000Z",
        },
        {
          id: "e",
          storeId: "s5",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-07T00:00:00.000Z",
          endAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      {
        placementKey: "STORES_HOME_HERO",
        startAt: "2026-09-08T00:00:00.000Z",
        endAt: "2026-09-09T00:00:00.000Z",
      }
    );
    expect(r.capacity).toBe(5);
    expect(r.overlappingCount).toBe(5);
    expect(r.full).toBe(true);
    expect(r.messageKo).toContain("예약이 가득");
  });

  it("authority matrix exposes writer-backed CTAs only", () => {
    // Owner LOCK: Promote has no Pause/Resume/End writers
    expect(isAdminAuthorityCtaAllowed("boost_community", "PAUSE")).toBe(false);
    expect(isAdminAuthorityCtaAllowed("boost_community", "APPROVE")).toBe(true);
    expect(isAdminAuthorityCtaAllowed("delivery_sponsored", "CREATE")).toBe(false);
    expect(isAdminAuthorityCtaAllowed("delivery_banner", "CREATE")).toBe(true);
  });
});
