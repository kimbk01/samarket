import { describe, expect, it } from "vitest";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";

/** Network/live host proof — run explicitly: EXTERNAL_BOARD_LIVE_VERIFY=1 */
const LIVE = process.env.EXTERNAL_BOARD_LIVE_VERIFY === "1";

describe.skipIf(!LIVE)("DOT Central Visayas adapter live smoke", () => {
  it("discovers child destinations with title/body/date", async () => {
    const { adapter, ctx } = resolveExternalBoardAdapter(
      "https://www.tourism.gov.ph/destination/central-visayas/"
    );
    expect(adapter?.id).toBe("dot-tourism-destination");
    const items = await adapter!.discoverArticles(ctx, { limit: 5, pageFrom: 1, pageTo: 1 });
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items.slice(0, 3)) {
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.canonicalUrl).toContain("/destination/");
      expect(item.sampleDocument?.nodes?.length ?? 0).toBeGreaterThan(0);
      expect(item.sourcePublishedAt).toBeTruthy();
    }
  }, 60_000);
});
