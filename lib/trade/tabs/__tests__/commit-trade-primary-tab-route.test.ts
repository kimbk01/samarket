import { describe, expect, it } from "vitest";
import { isTradePrimaryTabCommitNoop } from "@/lib/trade/tabs/commit-trade-primary-tab-route";

describe("commitTradePrimaryTabRoute same-tab noop", () => {
  it("noops a re-click of 전체 when the URL is already the all feed", () => {
    expect(
      isTradePrimaryTabCommitNoop({
        fromTabIndex: 0,
        toTabIndex: 0,
        href: "/market?lgu=pasig",
        currentHref: "/market?lgu=pasig",
      })
    ).toBe(true);
  });

  it("does not noop 전체 when it drops q from the current HOME search", () => {
    expect(
      isTradePrimaryTabCommitNoop({
        fromTabIndex: 0,
        toTabIndex: 0,
        href: "/market?location=city&lgu=mandaluyong&radius=64",
        currentHref: "/market?location=city&lgu=mandaluyong&radius=64&q=Toyota",
      })
    ).toBe(false);
  });

  it("still commits when the tab index actually changes", () => {
    expect(
      isTradePrimaryTabCommitNoop({
        fromTabIndex: 0,
        toTabIndex: 1,
        href: "/market?category=used-car",
        currentHref: "/market",
      })
    ).toBe(false);
  });
});
