import { afterEach, describe, expect, it } from "vitest";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  clearTradeListPresentationSession,
  commitTradeListPresentationSession,
  peekTradeListPresentationSessionForIdentity,
  peekTradeListPresentationSessionIdentities,
  rememberTradeListPresentationSelection,
  tradeListPresentationHasProduct,
} from "@/lib/trade/marketplace/trade-list-presentation-session";

function fakePost(id: string): PostWithMeta {
  return { id } as PostWithMeta;
}

describe("trade-list-presentation-session", () => {
  afterEach(() => {
    clearTradeListPresentationSession();
  });

  it("retains expanded load-more posts across soft remount identity", () => {
    const posts = Array.from({ length: 40 }, (_, i) => fakePost(`p-${i + 1}`));
    commitTradeListPresentationSession({
      identity: "home-id",
      posts,
      visibleCount: 40,
      serverPage: 2,
      serverHasMore: true,
    });
    const live = peekTradeListPresentationSessionForIdentity("home-id");
    expect(live?.productIds).toHaveLength(40);
    expect(live?.visibleCount).toBe(40);
    expect(live?.serverPage).toBe(2);
    expect(tradeListPresentationHasProduct("home-id", "p-37")).toBe(true);
  });

  it("isolates HOME vs CATEGORY session identities", () => {
    commitTradeListPresentationSession({
      identity: "home-id",
      posts: [fakePost("home-1"), fakePost("home-2")],
      visibleCount: 2,
      serverPage: 1,
      serverHasMore: false,
    });
    commitTradeListPresentationSession({
      identity: "category-a",
      posts: [fakePost("cat-9"), fakePost("cat-10"), fakePost("cat-11")],
      visibleCount: 3,
      serverPage: 2,
      serverHasMore: true,
    });
    expect(peekTradeListPresentationSessionForIdentity("home-id")?.productIds).toEqual([
      "home-1",
      "home-2",
    ]);
    expect(peekTradeListPresentationSessionForIdentity("category-a")?.productIds).toEqual([
      "cat-9",
      "cat-10",
      "cat-11",
    ]);
    expect(peekTradeListPresentationSessionForIdentity("category-a")?.productIds).not.toContain(
      "home-1"
    );
    expect(peekTradeListPresentationSessionIdentities().sort()).toEqual(["category-a", "home-id"]);
  });

  it("remembers selected product geometry for reverse destination", () => {
    commitTradeListPresentationSession({
      identity: "id-a",
      posts: [fakePost("p-37")],
      visibleCount: 16,
      serverPage: 1,
      serverHasMore: false,
    });
    rememberTradeListPresentationSelection({
      identity: "id-a",
      productId: "p-37",
      scrollY: 1200,
      geometry: {
        mediaRect: { x: 10, y: 200, width: 100, height: 100 },
        priceRect: null,
        titleRect: null,
        metaRect: null,
        imageUrl: "https://example.com/a.jpg",
        priceText: "₱1",
        titleText: "Toy",
        locationText: "QC",
      },
    });
    const live = peekTradeListPresentationSessionForIdentity("id-a");
    expect(live?.selectedProductId).toBe("p-37");
    expect(live?.selectedGeometry?.mediaRect?.width).toBe(100);
    expect(live?.scrollY).toBe(1200);
  });

  it("does not return session for unrelated list identity", () => {
    commitTradeListPresentationSession({
      identity: "id-a",
      posts: [fakePost("p-1")],
      visibleCount: 16,
      serverPage: 1,
      serverHasMore: false,
    });
    expect(peekTradeListPresentationSessionForIdentity("id-b")).toBeNull();
  });
});
