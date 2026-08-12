import { describe, expect, it } from "vitest";
import {
  buildPostsPatchFromOwnerStatus,
  buildPostsPatchFromSellerListingState,
  postStatusForSellerListingState,
  sellerListingStateForPostStatus,
} from "@/lib/trade/posts-listing-write-fields";
import {
  TRADE_BRIDGE_EXIT_CONDITIONS,
  tradeBridgeRemovalAllowed,
} from "@/lib/trade/trade-bridge-exit-conditions";

describe("L1 posts listing write fields", () => {
  it("maps listing → status", () => {
    expect(postStatusForSellerListingState("inquiry")).toBe("active");
    expect(postStatusForSellerListingState("negotiating")).toBe("active");
    expect(postStatusForSellerListingState("reserved")).toBe("reserved");
    expect(postStatusForSellerListingState("completed")).toBe("sold");
  });

  it("maps owner status → listing", () => {
    expect(sellerListingStateForPostStatus("active")).toBe("inquiry");
    expect(sellerListingStateForPostStatus("reserved")).toBe("reserved");
    expect(sellerListingStateForPostStatus("sold")).toBe("completed");
    expect(sellerListingStateForPostStatus("hidden")).toBe(null);
  });

  it("build from listing always includes both columns", () => {
    const p = buildPostsPatchFromSellerListingState({
      sellerListingState: "negotiating",
      nowIso: "t0",
    });
    expect(p.status).toBe("active");
    expect(p.seller_listing_state).toBe("negotiating");
    expect(p.reserved_buyer_id).toBe(null);
  });

  it("build from owner hidden clears reserved", () => {
    const p = buildPostsPatchFromOwnerStatus({ postStatus: "hidden", nowIso: "t0" });
    expect(p.status).toBe("hidden");
    expect(p.seller_listing_state).toBe("inquiry");
    expect(p.reserved_buyer_id).toBe(null);
  });

  it("build from listing reserved binds buyer id", () => {
    const p = buildPostsPatchFromSellerListingState({
      sellerListingState: "reserved",
      nowIso: "t0",
      reservedBuyerId: "buyer-1",
    });
    expect(p.status).toBe("reserved");
    expect(p.seller_listing_state).toBe("reserved");
    expect(p.reserved_buyer_id).toBe("buyer-1");
  });
});

describe("trade bridge exit conditions (lock only)", () => {
  it("exports HS5 and mirror exit specs", () => {
    expect(TRADE_BRIDGE_EXIT_CONDITIONS.HS5_LEGACY_UNREAD.require.length).toBeGreaterThan(0);
    expect(TRADE_BRIDGE_EXIT_CONDITIONS.CM_TO_ITEM_TRADE_MIRROR.require.length).toBeGreaterThan(0);
  });

  it("removal denied until proven list complete", () => {
    expect(tradeBridgeRemovalAllowed("HS5_LEGACY_UNREAD", [])).toBe(false);
  });
});
