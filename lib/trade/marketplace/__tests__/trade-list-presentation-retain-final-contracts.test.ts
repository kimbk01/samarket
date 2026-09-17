/**
 * Final targeted retain contracts for Trade list↔detail presentation session.
 * Pure/session/composition + source wiring — no speculative behavior change.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  clearTradeListPresentationSession,
  commitTradeListPresentationSession,
  peekTradeListPresentationSessionForIdentity,
  rememberTradeListPresentationScroll,
  rememberTradeListPresentationSelection,
  tradeListPresentationHasProduct,
} from "@/lib/trade/marketplace/trade-list-presentation-session";
import {
  marketplaceBrowseStateIdentityKey,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fakePost(id: string): PostWithMeta {
  return { id } as PostWithMeta;
}

function identityFromSearch(search: string): string {
  return marketplaceBrowseStateIdentityKey(
    parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(search))
  );
}

/** Presentation floor used by Home remount — selected product must stay in window. */
function retainedVisibleFloor(input: {
  visibleCount: number;
  productIds: string[];
  selectedProductId: string | null;
  pageSize: number;
}): number {
  const selectedIdx =
    input.selectedProductId != null ? input.productIds.indexOf(input.selectedProductId) : -1;
  return Math.max(
    input.visibleCount,
    selectedIdx >= 0 ? selectedIdx + 1 : 0,
    input.pageSize
  );
}

describe("trade retained presentation — final targeted contracts", () => {
  afterEach(() => {
    clearTradeListPresentationSession();
  });

  it("HOME retained session: load-more posts + visibleCount floor", () => {
    const home = identityFromSearch("location=all");
    const posts = Array.from({ length: 50 }, (_, i) => fakePost(`h-${i + 1}`));
    commitTradeListPresentationSession({
      identity: home,
      posts,
      visibleCount: 32,
      serverPage: 2,
      serverHasMore: true,
    });
    rememberTradeListPresentationSelection({
      identity: home,
      productId: "h-17",
      scrollY: 900,
      geometry: {
        mediaRect: { x: 8, y: 120, width: 100, height: 100 },
        priceRect: null,
        titleRect: null,
        metaRect: null,
        imageUrl: "https://example.com/h17.jpg",
        priceText: "₱1",
        titleText: "Deep",
        locationText: "QC",
      },
    });
    const live = peekTradeListPresentationSessionForIdentity(home);
    expect(live?.posts).toHaveLength(50);
    expect(live?.visibleCount).toBe(32);
    expect(live?.serverPage).toBe(2);
    expect(live?.selectedProductId).toBe("h-17");
    expect(tradeListPresentationHasProduct(home, "h-17")).toBe(true);
    expect(
      retainedVisibleFloor({
        visibleCount: live!.visibleCount,
        productIds: live!.productIds,
        selectedProductId: live!.selectedProductId,
        pageSize: 16,
      })
    ).toBeGreaterThanOrEqual(17);
  });

  it("CATEGORY retained session: load-more + deep selected product", () => {
    const cat = identityFromSearch("location=all&category=cat-a");
    const posts = Array.from({ length: 40 }, (_, i) => fakePost(`c-${i + 1}`));
    commitTradeListPresentationSession({
      identity: cat,
      posts,
      visibleCount: 40,
      serverPage: 3,
      serverHasMore: false,
    });
    rememberTradeListPresentationSelection({
      identity: cat,
      productId: "c-28",
      scrollY: 1400,
      geometry: {
        mediaRect: { x: 4, y: 80, width: 90, height: 90 },
        priceRect: null,
        titleRect: null,
        metaRect: null,
        imageUrl: "https://example.com/c28.jpg",
        priceText: "₱2",
        titleText: "Cat deep",
        locationText: "MNL",
      },
    });
    const live = peekTradeListPresentationSessionForIdentity(cat);
    expect(live?.visibleCount).toBe(40);
    expect(live?.serverPage).toBe(3);
    expect(live?.selectedProductId).toBe("c-28");
    expect(live?.scrollY).toBe(1400);
  });

  it("session identity isolation: HOME ≠ CATEGORY; cross product/scroll/pagination leak = 0", () => {
    const home = identityFromSearch("location=all");
    const catA = identityFromSearch("location=all&category=aaa");
    const catB = identityFromSearch("location=all&category=bbb");
    expect(home).not.toBe(catA);
    expect(catA).not.toBe(catB);

    commitTradeListPresentationSession({
      identity: home,
      posts: [fakePost("home-1"), fakePost("home-2")],
      visibleCount: 32,
      serverPage: 2,
      serverHasMore: true,
    });
    rememberTradeListPresentationScroll(home, 1111);
    rememberTradeListPresentationSelection({
      identity: home,
      productId: "home-2",
      geometry: null,
    });

    commitTradeListPresentationSession({
      identity: catA,
      posts: [fakePost("a-1"), fakePost("a-2"), fakePost("a-3")],
      visibleCount: 24,
      serverPage: 1,
      serverHasMore: true,
    });
    rememberTradeListPresentationScroll(catA, 2222);
    rememberTradeListPresentationSelection({
      identity: catA,
      productId: "a-3",
      geometry: null,
    });

    const h = peekTradeListPresentationSessionForIdentity(home);
    const a = peekTradeListPresentationSessionForIdentity(catA);
    const b = peekTradeListPresentationSessionForIdentity(catB);

    expect(b).toBeNull();
    expect(h?.productIds).not.toContain("a-1");
    expect(a?.productIds).not.toContain("home-1");
    expect(h?.scrollY).toBe(1111);
    expect(a?.scrollY).toBe(2222);
    expect(h?.scrollY).not.toBe(a?.scrollY);
    expect(h?.serverPage).toBe(2);
    expect(a?.serverPage).toBe(1);
    expect(h?.visibleCount).toBe(32);
    expect(a?.visibleCount).toBe(24);
    expect(h?.selectedProductId).toBe("home-2");
    expect(a?.selectedProductId).toBe("a-3");
  });

  it("repeat product identity: A then B selection does not leak A into B session product owner", () => {
    const home = identityFromSearch("location=all");
    const posts = Array.from({ length: 40 }, (_, i) => fakePost(`r-${i + 1}`));
    commitTradeListPresentationSession({
      identity: home,
      posts,
      visibleCount: 40,
      serverPage: 2,
      serverHasMore: true,
    });
    rememberTradeListPresentationSelection({
      identity: home,
      productId: "r-17",
      scrollY: 800,
      geometry: {
        mediaRect: { x: 1, y: 1, width: 50, height: 50 },
        priceRect: null,
        titleRect: null,
        metaRect: null,
        imageUrl: "https://example.com/a.jpg",
        priceText: null,
        titleText: null,
        locationText: null,
      },
    });
    rememberTradeListPresentationSelection({
      identity: home,
      productId: "r-25",
      scrollY: 1200,
      geometry: {
        mediaRect: { x: 2, y: 2, width: 60, height: 60 },
        priceRect: null,
        titleRect: null,
        metaRect: null,
        imageUrl: "https://example.com/b.jpg",
        priceText: null,
        titleText: null,
        locationText: null,
      },
    });
    const live = peekTradeListPresentationSessionForIdentity(home);
    expect(live?.selectedProductId).toBe("r-25");
    expect(live?.selectedGeometry?.imageUrl).toContain("b.jpg");
    expect(live?.scrollY).toBe(1200);
  });

  it("visibleCount retained floor never drops below selected index + 1", () => {
    expect(
      retainedVisibleFloor({
        visibleCount: 16,
        productIds: Array.from({ length: 40 }, (_, i) => `p-${i}`),
        selectedProductId: "p-16",
        pageSize: 16,
      })
    ).toBe(17);
    expect(
      retainedVisibleFloor({
        visibleCount: 48,
        productIds: Array.from({ length: 50 }, (_, i) => `p-${i}`),
        selectedProductId: "p-16",
        pageSize: 16,
      })
    ).toBe(48);
  });
});

describe("trade retained presentation — reverse / cover / wiring contracts", () => {
  afterEach(() => {
    clearTradeListPresentationSession();
  });

  it("reverse destinationCommitted from retained geometry — search not required", async () => {
    const {
      armTradeMarketProductCompositionForward,
      armTradeMarketProductCompositionBack,
      clearTradeMarketProductComposition,
    } = await import("@/lib/trade/marketplace/trade-market-product-composition");
    clearTradeMarketProductComposition();

    const home = identityFromSearch("location=all");
    commitTradeListPresentationSession({
      identity: home,
      posts: [fakePost("listing-1")],
      visibleCount: 32,
      serverPage: 1,
      serverHasMore: true,
    });
    rememberTradeListPresentationSelection({
      identity: home,
      productId: "listing-1",
      geometry: {
        mediaRect: { x: 10, y: 100, width: 180, height: 180 },
        priceRect: null,
        titleRect: null,
        metaRect: null,
        imageUrl: "https://example.com/a.jpg",
        priceText: "₱1",
        titleText: "T",
        locationText: "QC",
      },
    });

    const card = {
      querySelector: (sel: string) => {
        if (sel.includes("photos") || sel.includes("media")) {
          return {
            getBoundingClientRect: () => ({
              left: 10,
              top: 100,
              width: 180,
              height: 180,
              right: 190,
              bottom: 280,
            }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;

    armTradeMarketProductCompositionForward({
      listingId: "listing-1",
      cardEl: card,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱1",
      listRouteKey: "/market?location=all",
    });

    const detailRoot = {
      querySelector: (sel: string) => {
        if (sel.includes("photos") || sel.includes("media")) {
          return {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
              width: 390,
              height: 390,
              right: 390,
              bottom: 390,
            }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;

    const back = armTradeMarketProductCompositionBack({
      listingId: "listing-1",
      rootEl: detailRoot,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱1",
      listRouteKey: "/market?location=all",
    });
    expect(back?.destinationCommitted).toBe(true);
    clearTradeMarketProductComposition();
  });

  it("no-image reverse: media absent, destination from text geometry, no fake media", async () => {
    const {
      armTradeMarketProductCompositionForward,
      armTradeMarketProductCompositionBack,
      clearTradeMarketProductComposition,
    } = await import("@/lib/trade/marketplace/trade-market-product-composition");
    clearTradeMarketProductComposition();

    const home = identityFromSearch("location=all");
    commitTradeListPresentationSession({
      identity: home,
      posts: [fakePost("text-1")],
      visibleCount: 24,
      serverPage: 1,
      serverHasMore: false,
    });
    rememberTradeListPresentationSelection({
      identity: home,
      productId: "text-1",
      geometry: {
        mediaRect: null,
        priceRect: { x: 12, y: 200, width: 80, height: 20 },
        titleRect: { x: 12, y: 230, width: 160, height: 18 },
        metaRect: { x: 12, y: 250, width: 100, height: 14 },
        imageUrl: null,
        priceText: "₱9",
        titleText: "No image",
        locationText: "QC",
      },
    });

    const card = {
      querySelector: (sel: string) => {
        if (sel.includes("price")) {
          return {
            getBoundingClientRect: () => ({
              left: 12,
              top: 200,
              width: 80,
              height: 20,
              right: 92,
              bottom: 220,
            }),
          };
        }
        if (sel.includes("title")) {
          return {
            getBoundingClientRect: () => ({
              left: 12,
              top: 230,
              width: 160,
              height: 18,
              right: 172,
              bottom: 248,
            }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;

    armTradeMarketProductCompositionForward({
      listingId: "text-1",
      cardEl: card,
      imageUrl: null,
      priceText: "₱9",
      titleText: "No image",
      listRouteKey: "/market?location=all",
    });

    const detailRoot = {
      querySelector: (sel: string) => {
        if (sel.includes("price")) {
          return {
            getBoundingClientRect: () => ({
              left: 16,
              top: 400,
              width: 120,
              height: 28,
              right: 136,
              bottom: 428,
            }),
          };
        }
        if (sel.includes("title")) {
          return {
            getBoundingClientRect: () => ({
              left: 16,
              top: 440,
              width: 200,
              height: 24,
              right: 216,
              bottom: 464,
            }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;

    const back = armTradeMarketProductCompositionBack({
      listingId: "text-1",
      rootEl: detailRoot,
      imageUrl: null,
      priceText: "₱9",
      titleText: "No image",
      listRouteKey: "/market?location=all",
    });
    expect(back?.mediaContract).toBe("absent_by_product");
    expect(back?.media).toBeNull();
    expect(back?.destinationCommitted).toBe(true);
    clearTradeMarketProductComposition();
  });

  it("Home+Category wire same session SSOT; identity-only pagination resetKey", () => {
    const home = read("components/home/HomeProductList.tsx");
    const category = read("components/post/PostListByCategory.tsx");
    const pagination = read(
      "lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination.ts"
    );
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");

    expect(home).toContain("trade-list-presentation-session");
    expect(category).toContain("trade-list-presentation-session");
    expect(home).toContain("commitTradeListPresentationSession");
    expect(category).toContain("commitTradeListPresentationSession");
    expect(home).toContain("peekTradeListPresentationSessionForIdentity");
    expect(category).toContain("peekTradeListPresentationSessionForIdentity");
    expect(home).toContain("marketplaceBrowseStateIdentityKey");
    expect(category).toContain("marketplaceBrowseStateIdentityKey");

    // Identity-only reset — must not fingerprint posts first/last (append would collapse).
    expect(home).toContain("resetKey: `${browseIdentityKey}:${listPaginationEpoch}`");
    expect(home).not.toContain("tradeListPaginationResetKey(tradeState, posts)");
    expect(pagination).toContain("must NOT fingerprint item ids");

    // Presentation floor + no commit while restore seed pending.
    expect(home).toContain("retainedVisibleFloor");
    expect(home).toContain("presentationVisibleCount");
    expect(home).toContain("if (retainedVisibleCountRef.current != null) return");

    // False-transition must not skip retained for current identity.
    expect(home).toContain("even if searchParams flickered");
    expect(home).toMatch(/if \(retained && retained\.posts\.length > 0\) \{/);

    // Continuity handoff: one product root; no per-slot flight either direction.
    expect(host).toContain('data-trade-product-composition-forward-model="product-continuity-handoff"');
    expect(host).toContain("data-trade-product-composition-product");
    expect(host).toContain("setTradeMarketContinuityHandoffActive");
    expect(host).toContain("isDetailProductPaintReady");
    expect(host).toContain("isListProductPaintReady");
    expect(host).toContain("enterForwardTransition");
    expect(host).toContain('data-trade-product-composition-prepare={isForward ? "full-surface"');
    expect(host).toContain('data-trade-product-composition-surface={isForward ? "full"');
    // Forward must not pin list-sized hold on white underlayer while waiting.
    expect(host).toContain("Forward: underlayer never used as waiting owner");
    expect(host).toContain("paintHandoff");
    expect(host).toContain("isDetailProductPaintReady");
    // Runtime geometric flight helpers must be absent (comments mentioning the words OK if functions gone).
    expect(host).not.toMatch(/\bfunction lerpRect\b|\blerpRect\s*\(/);
    expect(host).not.toMatch(/\bfunction applyBox\b|\bapplyBox\s*\(/);
    expect(host).not.toContain("paintReverse");
    expect(host).not.toContain("reverse-dock");
    expect(host).not.toContain("coverRef.current.style.opacity");
  });

  it("scrollRestoreDeferred machinery removed (proven dead under new architecture)", () => {
    const composition = read("lib/trade/marketplace/trade-market-product-composition.ts");
    const host = read("components/trade/TradeMarketProductCompositionHost.tsx");
    const scrollHook = read("lib/trade/location/use-trade-market-list-scroll-restore.ts");
    expect(composition).not.toContain("scrollRestoreDeferred");
    expect(composition).not.toContain("shouldDeferTradeMarketListScrollRestore");
    expect(host).not.toContain("isTradeMarketReverseScrollRestorePending");
    expect(host).not.toContain("takeDeferredTradeMarketListScrollRouteKey");
    expect(scrollHook).not.toContain("shouldDeferTradeMarketListScrollRestore");
  });
});
