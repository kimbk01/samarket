import { describe, expect, it } from "vitest";
import { buildDeliveryMenusApiBreakdown } from "@/lib/stores/delivery-menus-api-breakdown";

describe("delivery-menus-api-breakdown", () => {
  it("computes phase deltas from marks", () => {
    const t0 = 100;
    const b = buildDeliveryMenusApiBreakdown({
      slug: "aa11",
      startedAt: t0,
      marks: {
        authDone: 120,
        storeDone: 150,
        productsDone: 900,
        popularDone: 850,
        metaDone: 200,
        payloadDone: 920,
      },
      payloadBuildMs: 5,
      responseSizeBytes: 12000,
      queryCount: 6,
      cacheHit: false,
    });
    expect(b.products_fetch_ms).toBe(750);
    expect(b.popular_stats_ms).toBe(700);
    expect(b.cache_hit).toBe(false);
    expect(b.query_count).toBe(6);
  });
});
