import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";
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
        id: "ur-1",
        userId: "user-1",
        regionId: "ncr",
        cityId: "manila",
        barangay: "Ermita",
        label: "Ermita",
        isPrimary: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(qs).toContain("primary=restaurant");
    expect(qs).toContain("sub=all");
    expect(qs).toContain("region=");
    // ADDR-PRIV-004: primaryRegion.barangay 는 profiles 상세주소일 수 있어 전송하지 않는다
    expect(qs).not.toContain("district=");
  });
});

describe("scheduleStoresBrowseListPrewarm", () => {
  beforeEach(() => {
    stubVitestMinimalWindow();
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
