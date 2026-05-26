import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  describeMeAddressesListFailure,
  invalidateMeAddressesListClientCache,
  isMeAddressListCacheFresh,
  writeCachedMeAddressList,
  type MeAddressesListFetchResult,
} from "@/lib/addresses/address-list-client-cache";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function stubSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { sessionStorage });
  vi.stubGlobal("sessionStorage", sessionStorage);
  return store;
}

function minimalRow(id: string): UserAddressDTO {
  return {
    id,
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: "House",
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: null,
    cityMunicipality: null,
    barangay: null,
    district: null,
    streetAddress: null,
    buildingName: null,
    unitFloorRoom: "1F",
    landmark: null,
    latitude: 14.5,
    longitude: 121.0,
    placeId: "p1",
    formattedAddress: "Test St",
    roadAddress: null,
    detailAddress: "1F",
    deliveryNote: null,
    fullAddress: "Test St",
    neighborhoodName: null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: true,
    isDefaultTrade: true,
    isDefaultDelivery: true,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("address-list-client-cache freshness", () => {
  beforeEach(() => {
    stubSessionStorage();
    invalidateMeAddressesListClientCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isMeAddressListCacheFresh is false when empty", () => {
    expect(isMeAddressListCacheFresh()).toBe(false);
  });

  it("isMeAddressListCacheFresh is true right after writeCachedMeAddressList", () => {
    writeCachedMeAddressList([minimalRow("a1")]);
    expect(isMeAddressListCacheFresh(5000)).toBe(true);
  });

  it("invalidateMeAddressesListClientCache clears freshness", () => {
    writeCachedMeAddressList([minimalRow("a1")]);
    invalidateMeAddressesListClientCache();
    expect(isMeAddressListCacheFresh()).toBe(false);
  });
});

function mockTranslate(key: string): string {
  const map: Record<string, string> = {
    addr_ui_list_err_login_required: "LOGIN",
    addr_ui_list_err_invalid_response: "INVALID",
    addr_ui_table_missing: "TABLE_MISSING",
    addr_ui_list_err_network: "NETWORK",
    address_load_failed: "FALLBACK",
  };
  return map[key] ?? key;
}

describe("describeMeAddressesListFailure", () => {
  it("maps known error codes to i18n keys", () => {
    expect(
      describeMeAddressesListFailure(
        { ok: false, status: 401, rows: [], error: "login_required" } satisfies MeAddressesListFetchResult,
        mockTranslate,
      ),
    ).toBe("LOGIN");
    expect(
      describeMeAddressesListFailure(
        { ok: false, status: 500, rows: [], error: "user_addresses_table_missing" } satisfies MeAddressesListFetchResult,
        mockTranslate,
      ),
    ).toBe("TABLE_MISSING");
    expect(
      describeMeAddressesListFailure(
        { ok: false, status: 0, rows: [], error: "network_error" } satisfies MeAddressesListFetchResult,
        mockTranslate,
      ),
    ).toBe("NETWORK");
  });

  it("uses fallback key for load_failed", () => {
    expect(
      describeMeAddressesListFailure(
        { ok: false, status: 500, rows: [], error: "load_failed" } satisfies MeAddressesListFetchResult,
        mockTranslate,
      ),
    ).toBe("FALLBACK");
  });
});
