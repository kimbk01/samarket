import { describe, expect, it } from "vitest";
import { parseMarketTradeWriteReturnCategoryKey } from "@/lib/navigation/trade-meet-spot-return-to";

describe("parseMarketTradeWriteReturnCategoryKey", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("parses SSOT /market?category={uuid}", () => {
    expect(parseMarketTradeWriteReturnCategoryKey(`/market?category=${id}`)).toBe(id);
  });

  it("parses legacy /market/{id}", () => {
    expect(parseMarketTradeWriteReturnCategoryKey(`/market/${id}`)).toBe(id);
  });

  it("returns null for /market/sell (category passed separately to schedule)", () => {
    expect(parseMarketTradeWriteReturnCategoryKey("/market/sell")).toBeNull();
  });

  it("returns null for trade-meet-spot", () => {
    expect(parseMarketTradeWriteReturnCategoryKey("/market/trade-meet-spot")).toBeNull();
  });
});
