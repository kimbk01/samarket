import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

vi.mock("@/lib/addresses/fetch-address-defaults-client", () => ({
  fetchAddressDefaultsSnapshot: vi.fn(),
}));

vi.mock("@/lib/trade/location/resolve-trade-marketplace-default-city", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/trade/location/resolve-trade-marketplace-default-city")
  >("@/lib/trade/location/resolve-trade-marketplace-default-city");
  return {
    ...actual,
    resolveTradeMarketplaceCityScopeFromMasterRow: vi.fn(),
    resolveTradeMarketplaceDefaultCityFromMaster: vi.fn(),
  };
});

import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import {
  resolveTradeMarketplaceCityScopeFromMasterRow,
  resolveTradeMarketplaceDefaultCityFromMaster,
} from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import {
  buildTradeMarketplaceMasterOriginFingerprint,
  resolveTradeMarketplaceMasterAddressResetHref,
} from "@/lib/trade/location/trade-marketplace-master-address-reset";

const MASTER_KEY = "samarket:trade-browse-master-address-id:v1";

/** Vitest `environment: "node"` — stub sessionStorage (CI has no browser Storage). */
function installSessionStorageStub() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  return storage;
}

function masterDto(id: string): UserAddressDTO {
  return {
    id,
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Pasig",
    barangay: null,
    district: null,
    streetAddress: null,
    buildingName: null,
    unitFloorRoom: null,
    landmark: null,
    latitude: 14.5764,
    longitude: 121.0851,
    placeId: null,
    formattedAddress: null,
    roadAddress: null,
    detailAddress: null,
    deliveryNote: null,
    fullAddress: "Pasig",
    neighborhoodName: null,
    appRegionId: "ncr",
    appCityId: "pasig",
    useForLife: false,
    useForTrade: false,
    useForDelivery: false,
    isDefaultMaster: true,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("master address origin fingerprint reset", () => {
  beforeEach(() => {
    installSessionStorageStub();
    vi.mocked(fetchAddressDefaultsSnapshot).mockReset();
    vi.mocked(resolveTradeMarketplaceCityScopeFromMasterRow).mockReset();
    vi.mocked(resolveTradeMarketplaceDefaultCityFromMaster).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildTradeMarketplaceMasterOriginFingerprint uses id|lgu", () => {
    expect(
      buildTradeMarketplaceMasterOriginFingerprint("addr-1", {
        mode: "city",
        lguId: "pasig",
        canonicalId: "1381200000",
        radiusKm: null,
      })
    ).toBe("addr-1|1381200000");
    expect(buildTradeMarketplaceMasterOriginFingerprint("addr-1", null)).toBe("addr-1|none");
  });

  it("same master id + same LGU → no reset", async () => {
    sessionStorage.setItem(MASTER_KEY, "addr-1|1381200000");
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue({
      ok: true,
      defaults: { master: masterDto("addr-1") },
    } as never);
    vi.mocked(resolveTradeMarketplaceCityScopeFromMasterRow).mockResolvedValue({
      mode: "city",
      lguId: "pasig",
      canonicalId: "1381200000",
      radiusKm: null,
    });

    const href = await resolveTradeMarketplaceMasterAddressResetHref("/market", "");
    expect(href).toBeNull();
    expect(sessionStorage.getItem(MASTER_KEY)).toBe("addr-1|1381200000");
  });

  it("same master id + LGU change → CLASS-A reset href", async () => {
    sessionStorage.setItem(MASTER_KEY, "addr-1|1381200000");
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue({
      ok: true,
      defaults: { master: masterDto("addr-1") },
    } as never);
    vi.mocked(resolveTradeMarketplaceCityScopeFromMasterRow).mockResolvedValue({
      mode: "city",
      lguId: "quezon-city",
      canonicalId: "1374040000",
      radiusKm: null,
    });
    vi.mocked(resolveTradeMarketplaceDefaultCityFromMaster).mockResolvedValue({
      mode: "city",
      lguId: "quezon-city",
      canonicalId: "1374040000",
      radiusKm: null,
    });

    const href = await resolveTradeMarketplaceMasterAddressResetHref(
      "/market",
      "location=city&lgu=pasig"
    );
    expect(href).toBeTruthy();
    expect(href).toContain("location=city");
    expect(sessionStorage.getItem(MASTER_KEY)).toBe("addr-1|1374040000");
  });

  it("legacy bare master id upgrades fingerprint without reset", async () => {
    sessionStorage.setItem(MASTER_KEY, "addr-1");
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue({
      ok: true,
      defaults: { master: masterDto("addr-1") },
    } as never);
    vi.mocked(resolveTradeMarketplaceCityScopeFromMasterRow).mockResolvedValue({
      mode: "city",
      lguId: "pasig",
      canonicalId: "1381200000",
      radiusKm: null,
    });

    const href = await resolveTradeMarketplaceMasterAddressResetHref("/market", "");
    expect(href).toBeNull();
    expect(sessionStorage.getItem(MASTER_KEY)).toBe("addr-1|1381200000");
  });
});
