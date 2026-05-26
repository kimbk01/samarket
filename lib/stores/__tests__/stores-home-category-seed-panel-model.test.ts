import { describe, expect, it } from "vitest";
import { buildStoresHomeCategorySeedPanelModel } from "@/lib/stores/stores-home-category-seed-panel-model";

describe("buildStoresHomeCategorySeedPanelModel", () => {
  it("builds restaurant subs and primaries for ko", () => {
    const model = buildStoresHomeCategorySeedPanelModel("ko");
    expect(model.primarySlug).toBe("restaurant");
    expect(model.subs.length).toBeGreaterThan(0);
    expect(model.primaries[0]?.slug).toBe("restaurant");
    expect(model.primaryAriaLabel.length).toBeGreaterThan(0);
  });
});
