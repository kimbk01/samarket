import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/addresses/fetch-address-defaults-client", () => ({
  fetchAddressDefaultsSnapshot: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(() => null),
}));

import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  browseListUserOriginCoordsEqual,
  tryBrowserGeolocation,
  tryCoordsFromMeProfile,
  tryMasterOriginFromAddressDefaults,
} from "@/lib/stores/browse-list-user-origin-coords";
import { browseListCacheKey } from "@/lib/stores/stores-browse-response-cache";
import { browseCacheAddressPart } from "@/lib/stores/browse-route-origin";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADDR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function masterDefaults(opts: {
  id: string;
  lat: number | null;
  lng: number | null;
}) {
  return {
    ok: true,
    status: 200,
    defaults: {
      master: {
        id: opts.id,
        isDefaultMaster: true,
        latitude: opts.lat,
        longitude: opts.lng,
      },
    },
    neighborhoodFromLife: null,
  };
}

describe("CUT 4 delivery browse origin authority", () => {
  beforeEach(() => {
    vi.mocked(fetchAddressDefaultsSnapshot).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getCurrentUser).mockReturnValue(null);
  });

  it("C1: valid master → origin source=master with same-row addressId+coords", async () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: "user-1" } as never);
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue(
      masterDefaults({ id: ADDR_A, lat: 14.55, lng: 121.03 }) as never,
    );
    const r = await tryMasterOriginFromAddressDefaults();
    expect(r.auth).toBe("member");
    expect(r.masterPresent).toBe(true);
    expect(r.origin).toEqual({
      lat: 14.55,
      lng: 121.03,
      addressId: ADDR_A,
      source: "master",
    });
  });

  it("C2/C3: profiles geo helper is removed from Delivery authority", async () => {
    expect(await tryCoordsFromMeProfile()).toBeNull();
    const src = readFileSync(
      join(process.cwd(), "lib/stores/browse-list-user-origin-coords.ts"),
      "utf8",
    );
    expect(src).not.toContain("peekAppBootProfile");
    expect(src).not.toContain("fetchMeProfileDeduped");
    expect(src).toContain("REMOVED from Delivery browse authority: profiles");
  });

  it("invalid master coords → fail-closed (no GPS attach)", async () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: "user-1" } as never);
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue(
      masterDefaults({ id: ADDR_A, lat: null, lng: null }) as never,
    );
    const r = await tryMasterOriginFromAddressDefaults();
    expect(r.auth).toBe("member");
    expect(r.masterPresent).toBe(true);
    expect(r.origin).toBeNull();
  });

  it("CUT 5: null-island 0,0 is not master origin", async () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: "user-1" } as never);
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue(
      masterDefaults({ id: ADDR_A, lat: 0, lng: 0 }) as never,
    );
    const r = await tryMasterOriginFromAddressDefaults();
    expect(r.origin).toBeNull();
  });

  it("no master → member fail-closed", async () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: "user-1" } as never);
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue({
      ok: true,
      status: 200,
      defaults: { master: null },
      neighborhoodFromLife: null,
    } as never);
    const r = await tryMasterOriginFromAddressDefaults();
    expect(r.auth).toBe("member");
    expect(r.masterPresent).toBe(false);
    expect(r.origin).toBeNull();
  });

  it("guest 401 → auth guest (GPS path allowed separately)", async () => {
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue({
      ok: false,
      status: 401,
      defaults: null,
      neighborhoodFromLife: null,
    } as never);
    const r = await tryMasterOriginFromAddressDefaults();
    expect(r.auth).toBe("guest");
    expect(r.origin).toBeNull();
  });

  it("C4: master origin never pairs addressId with null/mismatched coords constructor", async () => {
    vi.mocked(fetchAddressDefaultsSnapshot).mockResolvedValue(
      masterDefaults({ id: ADDR_A, lat: 14.55, lng: null }) as never,
    );
    const r = await tryMasterOriginFromAddressDefaults();
    expect(r.origin).toBeNull();
  });

  it("C7: CUT 3 addressPart still isolates cache keys", () => {
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
    };
    const a = browseListCacheKey({ ...base, addressPart: browseCacheAddressPart(ADDR_A) });
    const b = browseListCacheKey({ ...base, addressPart: browseCacheAddressPart(null) });
    expect(a).not.toBe(b);
  });

  it("GPS helper does not invent addressId", async () => {
    const geo = {
      getCurrentPosition: (ok: PositionCallback) => {
        ok({
          coords: { latitude: 14.6, longitude: 121.1 },
        } as GeolocationPosition);
      },
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { geolocation: geo },
    });
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { isSecureContext: true },
    });
    const g = await tryBrowserGeolocation();
    expect(g?.source).toBe("gps");
    expect(g?.addressId).toBeNull();
  });

  it("equality includes source + addressId", () => {
    const a = { lat: 1, lng: 2, addressId: ADDR_A, source: "master" as const };
    expect(browseListUserOriginCoordsEqual(a, { ...a, source: "gps" })).toBe(false);
    expect(browseListUserOriginCoordsEqual(a, { ...a })).toBe(true);
  });

  it("C8: Community Local filter SSOT still independent of browse origin", () => {
    const feed = readFileSync(join(process.cwd(), "components/community/CommunityFeed.tsx"), "utf8");
    expect(feed).toContain("useCommunityLocalFilter");
    const city = readFileSync(
      join(process.cwd(), "lib/addresses/community-public-region-label.ts"),
      "utf8",
    );
    expect(city).toContain("formatPublicAddress");
  });
});
