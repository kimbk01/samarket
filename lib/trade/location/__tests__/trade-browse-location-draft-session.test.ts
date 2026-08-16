import { afterEach, describe, expect, it } from "vitest";
import {
  clearTradeBrowseLocationDraftSession,
  createTradeBrowseLocationDraftSession,
  readTradeBrowseLocationDraftSession,
  seedTradeBrowseLocationDraftSession,
  TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY,
  writeTradeBrowseLocationDraftSession,
} from "@/lib/trade/location/trade-browse-location-draft-session";
import { TRADE_BROWSE_RECOMMENDED_RADIUS_KM } from "@/lib/trade/location/trade-browse-radius";

describe("trade browse location draft session", () => {
  afterEach(() => {
    clearTradeBrowseLocationDraftSession();
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
