import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abortStoresBrowseAmbientPrewarm,
  isStoresBrowseHubPath,
  isStoresSurfacePath,
  resetDeliveryStoreDetailPrewarmLifecycleForTests,
  resolveStoresBrowseAmbientPrewarmSignal,
  shouldStartStoresBrowseAmbientPrewarm,
} from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";
import { deliveryStoreMenusPrewarm, resetDeliveryStoreMenusPrewarmForTests } from "@/lib/dibay/delivery-store-menus-prewarm";
import {
  deliveryStoreSummaryPrewarmAlways,
  resetDeliveryStoreDetailPrewarmForTests,
} from "@/lib/dibay/delivery-store-detail-prewarm";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";

const fetchMock = vi.fn();

vi.mock("@/lib/stores/store-delivery-api-client", () => ({
  fetchStoreMenusDeduped: (...args: unknown[]) => fetchMock("menus", ...args),
  fetchStoreSummaryDeduped: (...args: unknown[]) => fetchMock("summary", ...args),
  fetchStoreBannersDeduped: vi.fn().mockResolvedValue({ status: 200, json: {} }),
}));

function stubPathname(pathname: string): void {
  stubVitestMinimalWindow({ location: { pathname } as Location });
}

describe("delivery-store-detail-prewarm-lifecycle paths", () => {
  it("isStoresBrowseHubPath and isStoresSurfacePath", () => {
    expect(isStoresBrowseHubPath("/stores")).toBe(true);
    expect(isStoresBrowseHubPath("/stores/")).toBe(true);
    expect(isStoresBrowseHubPath("/stores/browse")).toBe(true);
    expect(isStoresBrowseHubPath("/stores/browse/restaurant")).toBe(true);
    expect(isStoresBrowseHubPath("/stores/aa11")).toBe(false);
    expect(isStoresSurfacePath("/stores/aa11")).toBe(true);
    expect(isStoresSurfacePath("/community-messenger")).toBe(false);
  });
});

describe("delivery-store-detail-prewarm-lifecycle ambient prewarm", () => {
  beforeEach(() => {
    resetDeliveryStoreDetailPrewarmLifecycleForTests();
    resetDeliveryStoreMenusPrewarmForTests();
    resetDeliveryStoreDetailPrewarmForTests();
    fetchMock.mockReset();
    stubPathname("/stores");
  });

  afterEach(() => {
    resetDeliveryStoreDetailPrewarmLifecycleForTests();
    vi.unstubAllGlobals();
  });

  it("ambient prewarm passes shared AbortSignal for non-force", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    deliveryStoreMenusPrewarm("aa11");
    expect(fetchMock).toHaveBeenCalledWith(
      "menus",
      "aa11",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("force prewarm omits AbortSignal", () => {
    fetchMock.mockResolvedValue({ status: 200, json: {} });
    deliveryStoreSummaryPrewarmAlways("aa11", { force: true });
    expect(fetchMock).toHaveBeenCalledWith("summary", "aa11", { signal: undefined });
  });

  it("skips ambient prewarm when pathname is not /stores browse hub", () => {
    stubPathname("/community-messenger");
    expect(shouldStartStoresBrowseAmbientPrewarm()).toBe(false);
    deliveryStoreMenusPrewarm("aa11");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abortStoresBrowseAmbientPrewarm aborts ambient signal", async () => {
    fetchMock.mockImplementation((_kind, _slug, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const signal = resolveStoresBrowseAmbientPrewarmSignal();
    deliveryStoreMenusPrewarm("aa11");
    expect(signal?.aborted).toBe(false);

    abortStoresBrowseAmbientPrewarm("bottom_nav_route_commit");
    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    fetchMock.mockResolvedValue({ status: 200, json: {} });
    deliveryStoreMenusPrewarm("aa11");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
