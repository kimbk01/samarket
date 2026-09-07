import { describe, expect, it } from "vitest";
import {
  browseCacheAddressPart,
  parseBrowseUserAddressIdParam,
  resolveBrowseRouteOrigin,
} from "@/lib/stores/browse-route-origin";
import { browseListCacheKey } from "@/lib/stores/stores-browse-response-cache";
import { buildStoresBrowseClientQueryString } from "@/lib/stores/build-stores-browse-client-query";
import { browseListUserOriginCoordsEqual } from "@/lib/stores/browse-list-user-origin-coords";

const ADDR_A = "11111111-1111-4111-8111-111111111111";
const ADDR_B = "22222222-2222-4222-8222-222222222222";

describe("CUT 3 delivery browse address identity cache", () => {
  it("C1: same 2-decimal geo bucket + different addressId → different cache keys", () => {
    const geo = "g:14.55,121.03";
    const base = {
      primary: "restaurant",
      sub: "all",
      region: "",
      city: "",
      district: "",
      geoPart: geo,
      page: "1",
      limit: "20",
      sort: "default",
      uiLang: "ko",
      popularityWindowDays: 30,
    };
    const a = browseListCacheKey({ ...base, addressPart: browseCacheAddressPart(ADDR_A) });
    const b = browseListCacheKey({ ...base, addressPart: browseCacheAddressPart(ADDR_B) });
    expect(a).not.toBe(b);
  });

  it("C2: same addressId + same filters → same cache key", () => {
    const parts = {
      primary: "restaurant",
      sub: "all",
      region: "Manila",
      city: "Makati",
      district: "",
      addressPart: browseCacheAddressPart(ADDR_A),
      geoPart: "g:14.55,121.03",
      page: "1",
      limit: "20",
      sort: "distance",
      uiLang: "en",
      popularityWindowDays: 30,
    };
    expect(browseListCacheKey(parts)).toBe(browseListCacheKey({ ...parts }));
  });

  it("parses user_address_id into cacheAddressPart", () => {
    const sp = new URLSearchParams({
      user_lat: "14.5540",
      user_lng: "121.0330",
      user_address_id: ADDR_A,
    });
    const origin = resolveBrowseRouteOrigin(sp);
    expect(origin.addressId).toBe(ADDR_A);
    expect(origin.cacheAddressPart).toBe(`addr:${ADDR_A}`);
    expect(origin.cacheGeoPart).toBe("g:14.55,121.03");
  });

  it("rejects non-uuid user_address_id", () => {
    expect(parseBrowseUserAddressIdParam("not-a-uuid")).toBeNull();
    expect(browseCacheAddressPart(null)).toBe("addr:none");
  });

  it("client query includes user_address_id with geo", () => {
    const qs = buildStoresBrowseClientQueryString({
      primary: "restaurant",
      sub: "all",
      includeGeo: true,
      userLat: 14.55,
      userLng: 121.03,
      userAddressId: ADDR_A,
    });
    expect(qs).toContain("user_lat=");
    expect(qs).toContain("user_lng=");
    expect(qs).toContain(`user_address_id=${ADDR_A}`);
  });

  it("origin equality treats addressId change as different even if coords match", () => {
    const a = { lat: 14.55, lng: 121.03, addressId: ADDR_A, source: "master" as const };
    const b = { lat: 14.55, lng: 121.03, addressId: ADDR_B, source: "master" as const };
    expect(browseListUserOriginCoordsEqual(a, b)).toBe(false);
    expect(browseListUserOriginCoordsEqual(a, { ...a })).toBe(true);
  });
});
