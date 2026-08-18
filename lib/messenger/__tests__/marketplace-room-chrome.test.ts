import { describe, expect, it } from "vitest";
import {
  formatTradeMarketplacePeerProductTitle,
  resolveTradeWindowCounterpartyRole,
} from "@/lib/community-messenger/room/phase2/marketplace-room-chrome";

describe("formatTradeMarketplacePeerProductTitle", () => {
  it("joins counterparty and listing like Marketplace header", () => {
    expect(formatTradeMarketplacePeerProductTitle("Yhuna Rodriguez", "2012 Hyundai Grand Starex Gold")).toBe(
      "Yhuna Rodriguez · 2012 Hyundai Grand Starex Gold"
    );
  });

  it("falls back to listing when peer is missing", () => {
    expect(formatTradeMarketplacePeerProductTitle("", "맥북")).toBe("맥북");
  });
});

describe("resolveTradeWindowCounterpartyRole", () => {
  const seller = "seller-1";
  const buyer = "buyer-1";

  it("buyer viewer sees seller as counterparty", () => {
    expect(
      resolveTradeWindowCounterpartyRole({
        viewerUserId: buyer,
        sellerUserId: seller,
        buyerUserId: buyer,
      })
    ).toBe("seller");
  });

  it("seller viewer sees buyer as counterparty", () => {
    expect(
      resolveTradeWindowCounterpartyRole({
        viewerUserId: seller,
        sellerUserId: seller,
        buyerUserId: buyer,
      })
    ).toBe("buyer");
  });

  it("never returns the viewer as the listed role when ids match", () => {
    const role = resolveTradeWindowCounterpartyRole({
      viewerUserId: seller,
      sellerUserId: seller,
      buyerUserId: buyer,
    });
    expect(role).not.toBe("seller");
  });
});
