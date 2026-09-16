import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";

const prepare = vi.fn();

vi.mock("@/lib/trade/location/trade-market-list-scroll-restore", () => ({
  prepareTradeMarketListToDetailNavigation: (...args: unknown[]) => prepare(...args),
}));

import { handleTradeMarketCardDetailClick } from "@/lib/trade/location/trade-market-card-detail-nav";

describe("trade-market-card-detail-nav", () => {
  beforeEach(() => {
    prepare.mockReset();
  });

  it("prepares scroll restore and never preventDefault / router.push (Link owns nav)", () => {
    const preventDefault = vi.fn();
    const push = vi.fn();

    const handled = handleTradeMarketCardDetailClick({
      event: { preventDefault },
      postId: "post-1",
      detailHref: "/post/post-1",
      routeKey: "/market?location=all",
      cardEl: null,
      router: { push } as never,
    });

    expect(prepare).toHaveBeenCalledWith({ routeKey: "/market?location=all", postId: "post-1" });
    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    const src = fs.readFileSync("lib/trade/location/trade-market-card-detail-nav.ts", "utf8");
    // Executable body must not reintroduce card VT / nav ownership.
    expect(src).not.toMatch(/document\.startViewTransition/);
    expect(src).not.toMatch(/router\.push\s*\(/);
    expect(src).not.toMatch(/event\.preventDefault\s*\(/);
    expect(src).toContain("armTradeMarketProductCompositionForward");
    expect(src).not.toMatch(/trade-market-card-morph/);
    expect(src).not.toContain("armTradeMarketCardMorphForward");
  });

  it("PostCard still wires the helper without owning a second navigator", () => {
    const src = fs.readFileSync("components/post/PostCard.tsx", "utf8");
    expect(src).toContain("handleTradeMarketCardDetailClick");
    expect(src).toContain("<Link");
    expect(src).toContain("href={detailHref}");
    // Card must not call router.push for detail itself
    expect(src).not.toMatch(/router\.push\(\s*detailHref/);
  });
});
