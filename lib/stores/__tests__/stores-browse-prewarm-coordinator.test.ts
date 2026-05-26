import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStoresBrowseClientQueryString } from "@/lib/stores/build-stores-browse-client-query";
import {
  resetStoresBrowsePrewarmCoordinatorForTests,
  scheduleStoresBrowseListPrewarm,
} from "@/lib/stores/stores-browse-prewarm-coordinator";

vi.mock("@/lib/stores/store-delivery-api-client", () => ({
  peekStoresBrowseClientCache: vi.fn(() => null),
  fetchStoresBrowseDeduped: vi.fn(async () => ({ status: 200, json: { ok: true } })),
}));

describe("buildStoresBrowseClientQueryString", () => {
  it("includes primary, sub, and region", () => {
    const qs = buildStoresBrowseClientQueryString({
      primary: "restaurant",
      sub: "all",
      primaryRegion: {
        regionId: "ncr",
        cityId: "manila",
        barangay: "Ermita",
      },
    });
    expect(qs).toContain("primary=restaurant");
    expect(qs).toContain("sub=all");
    expect(qs).toContain("region=");
    expect(qs).toContain("district=Ermita");
  });
});

describe("scheduleStoresBrowseListPrewarm", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { requestIdleCallback: undefined } as Window & typeof globalThis);
    resetStoresBrowsePrewarmCoordinatorForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStoresBrowsePrewarmCoordinatorForTests();
  });

  it("dedupes duplicate prewarm within 10s", async () => {
    const { fetchStoresBrowseDeduped } = await import("@/lib/stores/store-delivery-api-client");
    scheduleStoresBrowseListPrewarm({ primary: "restaurant", sub: "all", language: "en" });
    scheduleStoresBrowseListPrewarm({ primary: "restaurant", sub: "all", language: "en" });
    await Promise.resolve();
    expect(fetchStoresBrowseDeduped).toHaveBeenCalledTimes(1);
  });
});
