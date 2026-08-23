import { describe, expect, it } from "vitest";
import {
  STORES_HOME_PRESENTATION_MAP,
  storesHomePresentationRow,
} from "@/lib/stores/presentation/stores-home-presentation-map";

describe("stores-home-presentation-map", () => {
  it("covers all composer slots in Owner order", () => {
    const slots = STORES_HOME_PRESENTATION_MAP.map((r) => r.slot);
    expect(slots).toEqual([
      "slot0Food",
      "slot1Stores",
      "slot2Food",
      "newStoreFood",
      "campaignFood",
      "slot3Food",
      "slot4Food",
      "slot5Food",
      "slot6NearbyStores",
      "slot6RestStores",
    ]);
  });

  it("never maps store slots to category presentation", () => {
    for (const slot of ["slot1Stores", "slot6NearbyStores", "slot6RestStores"] as const) {
      const row = storesHomePresentationRow(slot);
      expect(row.componentOwner).toBe("StoresHomeTimesaleRowCard");
      expect(row.patternId).toBe("timesale_vertical");
    }
  });

  it("does not claim MATCH for slots without A-VIS pattern", () => {
    expect(storesHomePresentationRow("newStoreFood").decision).toBe("NO_MATCH");
    expect(storesHomePresentationRow("campaignFood").decision).toBe("NO_MATCH");
    expect(storesHomePresentationRow("slot5Food").decision).toBe("NO_MATCH");
  });
});
