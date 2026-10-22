import { describe, expect, it } from "vitest";
import {
  assertHeroCapacityForWindow,
  DELIVERY_HERO_CAPACITY,
  DELIVERY_HERO_PLACEMENT_KEY,
  HERO_OCCUPYING_LIFECYCLES,
} from "@/lib/admin/ads-exposure/capacity-gate";
import { DELIVERY_AD_LIFECYCLE_STATUSES } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { PlacementOccupancyInput } from "@/lib/admin/ads-operator/placement-occupancy";

function camp(
  id: string,
  life: string,
  start: string,
  end: string
): PlacementOccupancyInput {
  return {
    id,
    storeId: `s-${id}`,
    storeName: id,
    inventoryKeys: [DELIVERY_HERO_PLACEMENT_KEY],
    lifecycleStatus: life,
    startAt: start,
    endAt: end,
  };
}

describe("HERO capacity overlap gate", () => {
  it("blocks when 5 ACTIVE overlap the requested window", () => {
    const campaigns = [1, 2, 3, 4, 5].map((n) =>
      camp(`c${n}`, "ACTIVE", "2026-09-10T00:00:00.000Z", "2026-09-20T00:00:00.000Z")
    );
    const r = assertHeroCapacityForWindow({
      campaigns,
      startAt: "2026-09-15T00:00:00.000Z",
      endAt: "2026-09-18T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("capacity_full");
    expect(DELIVERY_HERO_CAPACITY).toBe(5);
  });

  it("allows non-overlapping later window", () => {
    const campaigns = [1, 2, 3, 4, 5].map((n) =>
      camp(`c${n}`, "ACTIVE", "2026-09-10T00:00:00.000Z", "2026-09-20T00:00:00.000Z")
    );
    const r = assertHeroCapacityForWindow({
      campaigns,
      startAt: "2026-10-01T00:00:00.000Z",
      endAt: "2026-10-05T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
  });

  it.each(["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"])(
    "ADC-10: counts in-review lifecycle %s toward capacity (overbook prevention)",
    (life) => {
      const campaigns = [1, 2, 3, 4, 5].map((n) =>
        camp(`c${n}`, life, "2026-09-10T00:00:00.000Z", "2026-09-20T00:00:00.000Z")
      );
      const r = assertHeroCapacityForWindow({
        campaigns,
        startAt: "2026-09-12T00:00:00.000Z",
        endAt: "2026-09-14T00:00:00.000Z",
      });
      expect(r.ok).toBe(false);
    }
  );

  it("ADC-10: occupying set uses only real lifecycle statuses", () => {
    for (const s of HERO_OCCUPYING_LIFECYCLES) {
      expect((DELIVERY_AD_LIFECYCLE_STATUSES as readonly string[]).includes(s)).toBe(true);
    }
  });

  it("excludes self when rescheduling", () => {
    const campaigns = [1, 2, 3, 4, 5].map((n) =>
      camp(`c${n}`, "ACTIVE", "2026-09-10T00:00:00.000Z", "2026-09-20T00:00:00.000Z")
    );
    const r = assertHeroCapacityForWindow({
      campaigns,
      startAt: "2026-09-12T00:00:00.000Z",
      endAt: "2026-09-14T00:00:00.000Z",
      excludeCampaignId: "c1",
    });
    expect(r.ok).toBe(true);
  });
});
