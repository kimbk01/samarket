import { describe, expect, it } from "vitest";
import { resolveMasterCityMunicipalityForNationalLgu } from "@/lib/trade/location/resolve-master-city-for-national-lgu";
import {
  isRecoverableTradeLocationHydrateInvalid,
  parseTradeLocationScopeFromSearchParams,
  TRADE_LOCATION_HYDRATE_INVALID_RAW,
} from "@/lib/trade/location/trade-location-scope";
import {
  peekTradeListReturnHref,
  rememberTradeListReturnHref,
} from "@/lib/trade/location/trade-list-return-href";

describe("trade marketplace location hydrate recovery", () => {
  it("recoverable invalid tokens include hydrate failure raw values", () => {
    expect(
      isRecoverableTradeLocationHydrateInvalid({
        mode: "invalid",
        raw: TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_LGU_UNRESOLVED,
      })
    ).toBe(true);
    expect(
      isRecoverableTradeLocationHydrateInvalid({
        mode: "invalid",
        raw: TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_HYDRATE_ERROR,
      })
    ).toBe(true);
    expect(
      isRecoverableTradeLocationHydrateInvalid(
        parseTradeLocationScopeFromSearchParams(
          new URLSearchParams("location=city&lgu=garbage")
        )
      )
    ).toBe(false);
  });

  it("legacy master appCityId fills cityMunicipality for national LGU resolve", () => {
    const fields = resolveMasterCityMunicipalityForNationalLgu({
      id: "a1",
      userId: "u1",
      labelType: "home",
      linkedStoreId: null,
      nickname: null,
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
      unitFloorRoom: null,
      landmark: null,
      latitude: null,
      longitude: null,
      placeId: null,
      formattedAddress: null,
      roadAddress: null,
      detailAddress: null,
      deliveryNote: null,
      fullAddress: null,
      neighborhoodName: null,
      appRegionId: "manila",
      appCityId: "m20",
      useForLife: true,
      useForTrade: true,
      useForDelivery: true,
      isDefaultMaster: true,
      isDefaultLife: false,
      isDefaultTrade: false,
      isDefaultDelivery: false,
      isActive: true,
      sortOrder: 0,
      lastUsedAt: null,
      createdAt: "",
      updatedAt: "",
    });
    expect(fields?.cityMunicipality).toBe("Pasig City");
    expect(fields?.province).toBe("Manila");
  });

  it("trade list return href skips invalid and recoverable hydrate URLs", () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const prev = globalThis.sessionStorage;
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: sessionStorage,
    });
    try {
      rememberTradeListReturnHref("/market?location=city&lgu=pasig");
      expect(peekTradeListReturnHref()).toBe("/market?location=city&lgu=pasig");

      rememberTradeListReturnHref(
        `/market?location=city&lgu=${TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_LGU_UNRESOLVED}`
      );
      expect(peekTradeListReturnHref()).toBe("/market?location=city&lgu=pasig");

      store.clear();
      store.set(
        "samarket:trade-list-return:v1",
        `/market?location=city&lgu=${TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_LGU_UNRESOLVED}`
      );
      expect(peekTradeListReturnHref()).toBeNull();
      expect(store.has("samarket:trade-list-return:v1")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: prev,
      });
    }
  });
});
