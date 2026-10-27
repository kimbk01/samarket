import { describe, expect, it } from "vitest";
import { resolveMessengerTradeActionStripKind } from "@/lib/trade/messenger-trade-action-strip";

describe("resolveMessengerTradeActionStripKind (P-1 · Marketplace 2-state)", () => {
  it("seller always gets the sold toggle row", () => {
    expect(resolveMessengerTradeActionStripKind({ viewerUserId: "s", sellerId: "s", hasProduct: true })).toBe(
      "seller_sold_toggle"
    );
  });

  it("buyer never sees the strip (no reserve/confirm/review steps)", () => {
    expect(resolveMessengerTradeActionStripKind({ viewerUserId: "b", sellerId: "s", hasProduct: true })).toBeNull();
  });

  it("no product or no viewer → nothing", () => {
    expect(resolveMessengerTradeActionStripKind({ viewerUserId: "s", sellerId: "s", hasProduct: false })).toBeNull();
    expect(resolveMessengerTradeActionStripKind({ viewerUserId: "", sellerId: "s", hasProduct: true })).toBeNull();
  });
});
