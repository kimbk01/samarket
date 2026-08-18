import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeTradeFeedKey, computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import { resolveHomePostsStatusOrByTradeState } from "@/lib/posts/home-posts-query-server";
import {
  marketplacePublicStatusBadge,
  parseMarketplacePublicTradeState,
  resolveMarketplacePublicListingStatus,
} from "@/lib/trade/marketplace/public-listing-status";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { buildTradeMarketFeedHref } from "@/lib/trade/tabs/trade-market-feed-href";

describe("resolveMarketplacePublicListingStatus", () => {
  it("maps L1 inquiry/negotiating/reserved to active", () => {
    expect(
      resolveMarketplacePublicListingStatus({ seller_listing_state: "inquiry", status: "active" })
    ).toBe("active");
    expect(
      resolveMarketplacePublicListingStatus({
        seller_listing_state: "negotiating",
        status: "active",
      })
    ).toBe("active");
    expect(
      resolveMarketplacePublicListingStatus({
        seller_listing_state: "reserved",
        status: "reserved",
      })
    ).toBe("active");
  });

  it("maps L1 completed and posts.status=sold to sold", () => {
    expect(
      resolveMarketplacePublicListingStatus({
        seller_listing_state: "completed",
        status: "sold",
      })
    ).toBe("sold");
    expect(
      resolveMarketplacePublicListingStatus({ seller_listing_state: "inquiry", status: "sold" })
    ).toBe("sold");
  });
});

describe("marketplace public tradeState", () => {
  it("aliases reserved URL to public active", () => {
    expect(parseMarketplacePublicTradeState("reserved")).toBe("active");
    expect(parseMarketplacePublicTradeState("active")).toBe("active");
    expect(parseMarketplacePublicTradeState("sold")).toBe("sold");
    expect(parseMarketplacePublicTradeState(null)).toBe("latest");
  });

  it("latest and active SQL include reserved; sold is separate", () => {
    const latest = resolveHomePostsStatusOrByTradeState("latest");
    const active = resolveHomePostsStatusOrByTradeState("active");
    const reservedAlias = resolveHomePostsStatusOrByTradeState("reserved");
    expect(latest).toBe("status.is.null,status.not.in.(hidden,sold)");
    expect(active).toBe(latest);
    expect(reservedAlias).toBe(latest);
    expect(resolveHomePostsStatusOrByTradeState("sold")).toBe("status.eq.sold");
    expect(latest).not.toContain("status.eq.reserved");
  });

  it("does not write reserved into marketplace href", () => {
    expect(buildTradeMarketFeedHref({ tradeState: "reserved" })).toBe("/market?tradeState=active");
    expect(buildTradeMarketFeedHref({ tradeState: "active" })).toBe("/market?tradeState=active");
    expect(buildTradeMarketFeedHref({ tradeState: "sold" })).toBe("/market?tradeState=sold");
    expect(buildTradeMarketFeedHref()).toBe("/market");
  });
});

describe("marketplace public badge", () => {
  it("shows 판매중 for reserved/negotiating, not 예약중/문의중", () => {
    const reserved = marketplacePublicStatusBadge({
      seller_listing_state: "reserved",
      status: "reserved",
    });
    const negotiating = marketplacePublicStatusBadge({
      seller_listing_state: "negotiating",
      status: "active",
    });
    expect(reserved.label).toBe("판매중");
    expect(negotiating.label).toBe("판매중");
    expect(reserved.label).not.toBe("예약중");
    expect(negotiating.label).not.toBe("문의중");
  });

  it("shows 판매완료 for sold", () => {
    expect(
      marketplacePublicStatusBadge({ seller_listing_state: "completed", status: "sold" }).label
    ).toBe("판매완료");
  });
});

describe("marketplace public filters do not expose reserved", () => {
  it("maps reserved feed cache key to active", () => {
    expect(computeTradeFeedKey([], "latest", undefined, { tradeState: "reserved" })).toBe(
      computeTradeFeedKey([], "latest", undefined, { tradeState: "active" })
    );
    expect(
      computeTradeFeedKeyForMarketParent("cat", "", "latest", undefined, { tradeState: "reserved" })
    ).toBe(
      computeTradeFeedKeyForMarketParent("cat", "", "latest", undefined, { tradeState: "active" })
    );
    expect(computeTradeFeedKey([], "latest", undefined, { tradeState: "reserved" })).toContain(
      "ts:active"
    );
    expect(computeTradeFeedKey([], "latest", undefined, { tradeState: "reserved" })).not.toContain(
      "ts:reserved"
    );
  });

  it("TradePrimaryTabs and SearchFilterBar drop reserved as a public option", () => {
    const tabs = readFileSync(
      resolve(process.cwd(), "components/trade/TradePrimaryTabs.tsx"),
      "utf8"
    );
    const search = readFileSync(
      resolve(process.cwd(), "components/search/SearchFilterBar.tsx"),
      "utf8"
    );
    expect(tabs).not.toContain('trade_market_sort_reserved');
    expect(tabs).not.toContain("allSortChip");
    expect(tabs).not.toContain('key: "latest"');
    expect(tabs).not.toContain('key: "active"');
    expect(tabs).not.toContain('key: "sold"');
    expect(search).toContain('status: "all" | "active" | "sold"');
    expect(search).not.toContain('"reserved"');
  });

  it("keeps L1 auto-promote writer and reserved buyer helper", () => {
    expect(
      existsSync(resolve(process.cwd(), "lib/trade/maybe-auto-promote-trade-listing-negotiating.ts"))
    ).toBe(true);
    expect(existsSync(resolve(process.cwd(), "lib/trade/reserved-item-chat.ts"))).toBe(true);
  });
});

describe("reserved buyer binding unchanged", () => {
  const reservedPost = {
    seller_listing_state: "reserved",
    status: "reserved",
    reserved_buyer_id: "buyer-reserved",
  };

  it("blocks other buyers while reserved", () => {
    expect(shouldBlockNewItemChatForBuyer(reservedPost, "buyer-other")).toBe(true);
    expect(shouldBlockNewItemChatForBuyer(reservedPost, "buyer-reserved")).toBe(false);
  });
});
