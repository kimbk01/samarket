/**
 * Trade LIST↔DETAIL — real PostDetailView surface ownership contracts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  armTradeMarketProductCompositionForward,
  clearTradeMarketProductComposition,
  isTradeMarketProductCompositionCoveringDetail,
} from "@/lib/trade/marketplace/trade-market-product-composition";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("trade detail surface owner contract", () => {
  it("TEST A — Trade forward navigation remains Link-only", () => {
    const nav = read("lib/trade/location/trade-market-card-detail-nav.ts");
    const card = read("components/post/PostCard.tsx");
    expect(nav).not.toMatch(/router\.push\s*\(/);
    expect(nav).not.toMatch(/event\.preventDefault\s*\(/);
    expect(card).toContain("<Link");
    expect(card).toContain("href={detailHref}");
    expect(card).not.toMatch(/router\.push\(\s*detailHref/);
  });

  it("TEST B — No trade startViewTransition", () => {
    const nav = read("lib/trade/location/trade-market-card-detail-nav.ts");
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    const composition = read("lib/trade/marketplace/trade-market-product-composition.ts");
    const css = read("app/market-list-detail-transition.css");
    expect(nav).not.toMatch(/document\.startViewTransition/);
    expect(host).not.toMatch(/startViewTransition/);
    expect(composition).not.toMatch(/startViewTransition/);
    expect(css).not.toContain("view-transition-name");
  });

  it("TEST C — Forward visual owner = real detail surface", () => {
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    const detail = read("components/post/PostDetailView.tsx");
    expect(host).toContain('data-trade-detail-surface-forward-owner="post-detail-root"');
    expect(detail).toContain('data-trade-detail-surface-owner="post-detail-root"');
    expect(detail).toContain("data-trade-product-composition-detail-root");
  });

  it("TEST D — Forward composition media cannot own full viewport transition", () => {
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    expect(host).not.toContain("layoutProductOnce");
    expect(host).not.toContain("innerWidth * 0.92");
    expect(host).not.toContain("object-cover");
    expect(host).not.toContain('data-trade-product-composition-slot="media"');
    expect(host).not.toContain("data-trade-product-composition-product");
  });

  it("TEST E — Detail is not hidden behind reconstructed image during forward enter", () => {
    const css = read("app/market-list-detail-transition.css");
    const detail = read("components/post/PostDetailView.tsx");
    const composition = read("lib/trade/marketplace/trade-market-product-composition.ts");
    expect(css).not.toContain("data-trade-product-composition-detail-cover");
    expect(detail).not.toContain("data-trade-product-composition-detail-cover");
    expect(composition).toContain("FORWARD COVER = FORBIDDEN");
    expect(isTradeMarketProductCompositionCoveringDetail("any")).toBe(false);
    clearTradeMarketProductComposition();
  });

  it("TEST F — Reverse source authority preserved until list ready", () => {
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    expect(host).toContain("SOURCE (real detail root) remains authoritative while list prepares");
    expect(host).toContain("isListProductPaintReady");
    expect(host).toContain("retainTradeDetailSurfaceNode");
    const reversePrepare = host.slice(host.indexOf("const enterReversePrepare"));
    const prepareBody = reversePrepare.slice(0, reversePrepare.indexOf("const beginHandoff"));
    expect(prepareBody).not.toContain("releaseTradeDetailSurfaceRetain()");
  });

  it("TEST G — Reverse white-gap lock preserved", () => {
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    const composition = read("lib/trade/marketplace/trade-market-product-composition.ts");
    expect(host).toContain("hide/release only at handoff after isListProductPaintReady");
    expect(composition).toContain("retainTradeDetailSurfaceNode");
    expect(composition).toContain("destinationCommitted");
    expect(composition).toContain("Must NOT steal the node from React");
    expect(composition).not.toMatch(/parent\.replaceChild|document\.body\.appendChild\(root\)/);
  });

  it("TEST H — Selected source product identity preserved", () => {
    const nav = read("lib/trade/location/trade-market-card-detail-nav.ts");
    expect(nav).toContain("rememberTradeListPresentationSelection");
    expect(nav).not.toContain("trade-list-presentation-session.ts");
    const session = read("lib/trade/marketplace/trade-list-presentation-session.ts");
    expect(session).toContain("selectedProductId");
  });

  it("TEST I — Scroll restoration preserved", () => {
    const nav = read("lib/trade/location/trade-market-card-detail-nav.ts");
    expect(nav).toContain("prepareTradeMarketListToDetailNavigation");
    expect(fs.existsSync(path.join(root, "lib/trade/location/use-trade-market-list-scroll-restore.ts"))).toBe(
      true
    );
  });

  it("TEST J — No tablet/device-specific transition branch", () => {
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    const css = read("app/market-list-detail-transition.css");
    const composition = read("lib/trade/marketplace/trade-market-product-composition.ts");
    const detail = read("components/post/PostDetailView.tsx");
    for (const src of [host, css, composition, detail]) {
      expect(src).not.toMatch(/TABLET_ANDROID|PHONE_ANDROID|DeviceClass/);
      expect(src).not.toMatch(/@media\s*\(\s*min-width:\s*(768|767|1024)/);
    }
  });

  it("forward cover stays off after arm (real detail must paint)", () => {
    const photos = {
      getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 180, right: 190, bottom: 280 }),
    };
    const card = {
      querySelector: (sel: string) => (sel.includes("photos") ? photos : null),
    } as unknown as HTMLElement;
    armTradeMarketProductCompositionForward({
      listingId: "cover-off",
      cardEl: card,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱1",
      titleText: "T",
      listRouteKey: "/market",
    });
    expect(isTradeMarketProductCompositionCoveringDetail("cover-off")).toBe(false);
    clearTradeMarketProductComposition();
  });
});
