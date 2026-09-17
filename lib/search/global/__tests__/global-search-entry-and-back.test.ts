import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeCommunityReturnHref, resolveCommunityDetailBackHref, writeCommunityPostEntryOrigin } from "@/lib/community/community-post-entry-nav";
import { isDeliveryListScrollRoute } from "@/lib/dibay/delivery-list-scroll-restore";
import { peekTradeListReturnHref, rememberTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { sanitizeCommunityKeywordQuery, communityPostTextMatchesKeyword } from "@/lib/community-feed/hashtag-discovery";

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("global search entry, adapters, back", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal("window", {
      location: { pathname: "/search", search: "?q=치킨", origin: "https://samarket.local" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hub magnifiers go to /search and SearchPageClient mounts GlobalSearchView", () => {
    expect(read("app/(main)/search/SearchPageClient.tsx")).toContain("GlobalSearchView");
    expect(read("app/(main)/search/SearchPageClient.tsx")).not.toContain('from "@/components/search/SearchView"');
    expect(read("components/layout/RegionBarMainHubTier1.tsx")).toContain('href="/search"');
    expect(read("components/stores/home/hub/StoresConsumerHeaderActions.tsx")).toContain('href="/search"');
    expect(read("components/stores/home/hub/StoresHomeHeaderChrome.tsx")).not.toContain("StoresHomeSearchModal");
    expect(read("components/community-messenger/CommunityMessengerHome.tsx")).toContain('router.push("/search")');
  });

  it("keeps domain sections and existing CTA helpers", () => {
    const view = read("components/search/global/GlobalSearchView.tsx");
    expect(view).toContain('data-global-search-section="community"');
    expect(view).toContain('data-global-search-section="trade"');
    expect(view).toContain('data-global-search-section="delivery-store"');
    expect(view).toContain('data-global-search-section="delivery-menu"');
    expect(view).toContain('data-global-search-section="chat"');
    expect(view).toContain("CommunityPostCard");
    expect(view).toContain("ProductCard");
    expect(view).toContain("navigateToDeliveryStoreCard");
    expect(view).toContain("navigateToDeliveryStoreProduct");
    expect(view).toContain("runCommunityMessengerRoomForwardNavigation");
    expect(view).toContain("originHrefOverride");
    expect(view).toContain("returnHrefOverride");
    expect(view).not.toContain("href={`/philife/");
  });

  it("neighborhood-feed q is additive keyword, not a new engine", () => {
    expect(sanitizeCommunityKeywordQuery("  치킨  ")).toBe("치킨");
    expect(communityPostTextMatchesKeyword({ title: "오늘 치킨", content: "", summary: "" }, "치킨")).toBe(true);
    expect(communityPostTextMatchesKeyword({ title: "분식", content: "", summary: "" }, "치킨")).toBe(false);
    expect(buildPhilifeNeighborhoodFeedClientUrl({ globalFeed: true, q: "치킨", limit: 10 })).toContain("q=%EC%B9%98%ED%82%A8");
    const route = read("app/api/community/neighborhood-feed/route.ts");
    expect(route).toContain("sanitizeCommunityKeywordQuery");
    expect(route).toContain("q: keywordQ || undefined");
  });

  it("trade adapter uses getPostsForHome and does not reopen CUT C", () => {
    const adapter = read("lib/search/global/adapters/trade-search-adapter.ts");
    expect(adapter).toContain("getPostsForHome");
    expect(adapter).toContain("sanitizeMarketplaceQueryText");
    expect(adapter).not.toContain("search-candidate-expansion");
  });

  it("delivery adapter calls existing search API only", () => {
    const adapter = read("lib/search/global/adapters/delivery-search-adapter.ts");
    expect(adapter).toContain("/api/stores/search");
    expect(adapter).not.toContain("searchDeliveryDomain");
  });

  it("allows /search restore on community, trade persist, and delivery scroll", () => {
    expect(isSafeCommunityReturnHref("/search?q=치킨")).toBe(true);
    expect(isSafeCommunityReturnHref("/admin")).toBe(false);
    const postId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    writeCommunityPostEntryOrigin({ postId, originHref: "/search?q=치킨", scrollY: 80 });
    expect(resolveCommunityDetailBackHref({ postId })).toBe("/search?q=치킨");
    rememberTradeListReturnHref("/search?q=치킨");
    expect(peekTradeListReturnHref()).toBe("/search?q=치킨");
    rememberTradeListReturnHref("/market?location=all");
    expect(peekTradeListReturnHref()).toBe("/market?location=all");
    expect(isDeliveryListScrollRoute("/search?q=치킨")).toBe(true);
    expect(read("lib/navigation/resolve-dibay-back-target.ts")).not.toContain("global-search");
  });

  it("search chrome title is global search with history back", () => {
    const resolved = resolveMainTier1Subpage("/search");
    expect(resolved?.titleText).toBe("global_search_title");
    expect(resolved?.preferHistoryBack).toBe(true);
  });
});
