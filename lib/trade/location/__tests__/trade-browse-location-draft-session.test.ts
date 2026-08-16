import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTradeBrowseLocationDraftSession,
  createTradeBrowseLocationDraftSession,
  readTradeBrowseLocationDraftSession,
  seedTradeBrowseLocationDraftSession,
  TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY,
  writeTradeBrowseLocationDraftSession,
} from "@/lib/trade/location/trade-browse-location-draft-session";
import { TRADE_BROWSE_RECOMMENDED_RADIUS_KM } from "@/lib/trade/location/trade-browse-radius";

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

describe("trade browse location draft session", () => {
  beforeEach(() => {
    installSessionStorageStub();
  });

  afterEach(() => {
    clearTradeBrowseLocationDraftSession();
    vi.unstubAllGlobals();
  });

  it("round-trips city draft + radius", () => {
    const session = seedTradeBrowseLocationDraftSession(
      {
        kind: "city",
        canonicalId: "1339000000",
        displayName: "Makati City",
        radiusKm: 64,
      },
      { mode: "recommended", km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM }
    );
    expect(session.location.kind).toBe("city");
    const read = readTradeBrowseLocationDraftSession();
    expect(read?.location).toEqual(session.location);
    expect(read?.radius.km).toBe(TRADE_BROWSE_RECOMMENDED_RADIUS_KM);
    expect(sessionStorage.getItem(TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY)).toBeTruthy();
  });

  it("clear removes session", () => {
    writeTradeBrowseLocationDraftSession(
      createTradeBrowseLocationDraftSession({ kind: "all" })
    );
    clearTradeBrowseLocationDraftSession();
    expect(readTradeBrowseLocationDraftSession()).toBeNull();
  });
});
