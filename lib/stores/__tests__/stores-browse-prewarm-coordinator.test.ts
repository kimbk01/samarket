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

const originMock = vi.fn(async () => ({
  auth: "member" as "member" | "guest" | "unknown",
  origin: null as null | { lat: number; lng: number; addressId: string | null; source: "master" },
  masterPresent: false,
}));
vi.mock("@/lib/stores/browse-list-user-origin-coords", () => ({
  tryMasterOriginFromAddressDefaults: () => originMock(),
}));

async function flushPrewarm() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

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
    await flushPrewarm();
    expect(fetchStoresBrowseDeduped).toHaveBeenCalledTimes(1);
  });

  it("v4 W3 PERF-05 — 회원 MASTER 좌표를 마운트와 같은 순서로 붙여 같은 키로 prewarm", async () => {
    originMock.mockResolvedValueOnce({
      auth: "member",
      origin: { lat: 14.5, lng: 121.01, addressId: "addr-1", source: "master" },
      masterPresent: true,
    });
    const { fetchStoresBrowseDeduped } = await import("@/lib/stores/store-delivery-api-client");
    scheduleStoresBrowseListPrewarm({ primary: "restaurant", sub: "all", language: "en" });
    await flushPrewarm();
    expect(fetchStoresBrowseDeduped).toHaveBeenCalledWith(
      "primary=restaurant&sub=all&user_lat=14.5&user_lng=121.01&user_address_id=addr-1",
      { language: "en" }
    );
  });

  it("v4 W3 PERF-05 — MASTER 없음·게스트는 좌표 없는 키 (마운트와 동일·GPS 미요청)", async () => {
    originMock.mockResolvedValueOnce({ auth: "guest", origin: null, masterPresent: false });
    const { fetchStoresBrowseDeduped } = await import("@/lib/stores/store-delivery-api-client");
    scheduleStoresBrowseListPrewarm({ primary: "cafe", sub: "all", language: "en" });
    await flushPrewarm();
    expect(fetchStoresBrowseDeduped).toHaveBeenCalledWith("primary=cafe&sub=all", { language: "en" });
  });
});
