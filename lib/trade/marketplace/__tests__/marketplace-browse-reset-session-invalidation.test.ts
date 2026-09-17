import { afterEach, describe, expect, it } from "vitest";
import {
  clearTradeListPresentationSession,
  commitTradeListPresentationSession,
  peekTradeListPresentationSessionForIdentity,
} from "@/lib/trade/marketplace/trade-list-presentation-session";
import { applyMarketplaceBrowseResetClientEffects } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import {
  marketplaceBrowseStateIdentityKey,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";
import { buildTradeLocationHref } from "@/lib/trade/location/trade-location-scope";
import type { PostWithMeta } from "@/lib/posts/schema";

function fakePosts(n: number): PostWithMeta[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    title: `t${i + 1}`,
  })) as PostWithMeta[];
}

function installWindow(search: string) {
  const listeners = new Map<string, Set<(ev: Event) => void>>();
  const win = {
    location: { search },
    addEventListener(type: string, fn: (ev: Event) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (ev: Event) => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(ev: Event) {
      const type = (ev as { type?: string }).type ?? "";
      for (const fn of listeners.get(type) ?? []) fn(ev);
      return true;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = win;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  return win;
}

afterEach(() => {
  clearTradeListPresentationSession();
});

describe("R-A CLASS A matching-identity session invalidation", () => {
  it("invalidates only the matching browse identity; preserves other identity", () => {
    const cityHref = buildTradeLocationHref("/market", "", {
      mode: "city",
      lguId: "pasig",
      canonicalId: "1381200000",
      radiusKm: null,
    });
    const citySearch = cityHref.includes("?") ? cityHref.split("?")[1]! : "";
    const identityA = marketplaceBrowseStateIdentityKey(
      parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(citySearch))
    );
    const identityB = marketplaceBrowseStateIdentityKey(
      parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams("location=all"))
    );
    expect(identityA).not.toBe(identityB);

    commitTradeListPresentationSession({
      identity: identityA,
      posts: fakePosts(48),
      favoriteMap: {},
      visibleCount: 48,
      serverPage: 3,
      serverHasMore: true,
    });
    commitTradeListPresentationSession({
      identity: identityB,
      posts: fakePosts(16),
      favoriteMap: {},
      visibleCount: 16,
      serverPage: 1,
      serverHasMore: true,
    });

    installWindow(citySearch.startsWith("?") ? citySearch : `?${citySearch}`);
    // window.location.search should be without leading ? for URLSearchParams in effects —
    // effects uses `new URLSearchParams(window.location.search)` which accepts both.
    applyMarketplaceBrowseResetClientEffects();

    expect(peekTradeListPresentationSessionForIdentity(identityA)).toBeNull();
    const b = peekTradeListPresentationSessionForIdentity(identityB);
    expect(b).not.toBeNull();
    expect(b?.visibleCount).toBe(16);
    expect(b?.serverPage).toBe(1);
  });
});
