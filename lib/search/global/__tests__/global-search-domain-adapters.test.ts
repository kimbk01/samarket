import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchCommunityForGlobal } from "@/lib/search/global/adapters/community-search-adapter";
import { searchTradeForGlobal } from "@/lib/search/global/adapters/trade-search-adapter";
import { searchDeliveryForGlobal } from "@/lib/search/global/adapters/delivery-search-adapter";
import { filterMembershipRoomsForGlobalSearch } from "@/lib/search/global/adapters/chat-search-adapter";
import { communityPostTextMatchesKeyword } from "@/lib/community-feed/hashtag-discovery";
import { normalizeDeliveryKeyword } from "@/lib/delivery/search/search-delivery";
import {
  matchChatGlobalSearch,
  matchDeliveryMenuGlobalSearch,
  matchDeliveryStoreGlobalSearch,
  matchTradeGlobalSearch,
} from "@/lib/search/global/semantics/domain-fields";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import { buildSearchHighlightSegments } from "@/lib/search/global/semantics/highlight";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { fetchGlobalSearchTradeMatchOnlyPosts } from "@/lib/search/global/trade-match-only-server";
import { tradePostFixture } from "@/lib/search/global/__tests__/trade-title-ilike-inspect";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/posts/home-posts-query-server", async (orig) => {
  const actual = await orig<typeof import("@/lib/posts/home-posts-query-server")>();
  return { ...actual, resolveHomePostsPayload: vi.fn() };
});
vi.mock("@/lib/trade/trade-market-catalog", () => ({
  expandTradeCategoryIdsForAllConfiguredHomeRoots: vi.fn(async () => []),
}));
vi.mock("@/lib/posts/enrich-posts-author-nicknames", () => ({
  enrichPostsAuthorNicknamesFromProfiles: vi.fn(async () => undefined),
}));

import { resolveHomePostsPayload } from "@/lib/posts/home-posts-query-server";

const payloadMock = vi.mocked(resolveHomePostsPayload);
const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function chatRoom(
  overrides: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id" | "title">
): CommunityMessengerRoomSummary {
  return {
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    chatDomain: "general_direct",
    ...overrides,
  } as CommunityMessengerRoomSummary;
}

describe("4 adapter semantic filters", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    payloadMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("community adapter: 김치 hits 김치찌개, rejects 김밥과 치킨, jamo does not fetch", async () => {
    expect(read("lib/neighborhood/queries.ts")).toContain("communityGlobalSearchFeedPreview");
    expect(communityPostTextMatchesKeyword({ title: "김치찌개 후기", content: "", summary: "" }, "김치")).toBe(true);
    expect(communityPostTextMatchesKeyword({ title: "김밥과 치킨", content: "", summary: "" }, "김치")).toBe(false);
    const skipped = await searchCommunityForGlobal("ㄱ", new AbortController().signal);
    expect(skipped).toEqual({ ok: true, posts: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        posts: [
          { id: "c1", title: "김치찌개 후기", content: "", summary: "" },
          { id: "c2", title: "김밥과 치킨", content: "", summary: "" },
        ],
      }),
    });
    const res = await searchCommunityForGlobal("김치", new AbortController().signal);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.posts.map((p) => p.id)).toEqual(["c1"]);
  });

  it("community adapter keeps later-body match when feed DTO carries a snippet", async () => {
    const title = "세부샹그릴라 신혼여행 후기";
    const truncated = "세부샹그릴라 리조트에서 보낸 신혼여행 일정과 객실, 조식, 수영장 풍경을 정리했습니다.";
    const snippet = "마지막 저녁은 돼지고기 김치찌개를 먹었습니다.";
    expect(communityPostTextMatchesKeyword({ title, content: truncated, summary: truncated }, "김치")).toBe(false);
    expect(communityPostTextMatchesKeyword({ title, content: snippet, summary: snippet }, "김치")).toBe(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        posts: [{ id: "body-kimchi", title, content: snippet, summary: snippet }],
      }),
    });
    const res = await searchCommunityForGlobal("김치", new AbortController().signal);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.posts.map((p) => p.id)).toEqual(["body-kimchi"]);
    expect(buildSearchHighlightSegments(String(res.posts[0]?.content ?? ""), "김치").some((s) => s.matched)).toBe(true);
  });

  it("trade adapter: title-only match, go does not fetch, SQL overmatch is filtered", async () => {
    expect(matchTradeGlobalSearch("Toyota Wigo", "Wigo").matched).toBe(true);
    expect(matchTradeGlobalSearch("Toyota Wigo", "go").matched).toBe(false);
    const skipped = await searchTradeForGlobal("go", {
      signal: new AbortController().signal,
      canFetch: true,
      locationAll: true,
    });
    expect(skipped).toEqual({ ok: true, products: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        posts: [
          tradePostFixture("wigo", "팝니다 Toyota Wigo"),
          tradePostFixture("going", "Going away sale"),
        ],
      }),
    });
    const res = await searchTradeForGlobal("Wigo", {
      signal: new AbortController().signal,
      canFetch: true,
      locationAll: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.products.map((p) => p.id)).toEqual(["wigo"]);
  });

  it("delivery adapter filters stores/menus with shared semantics", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        stores: [
          { id: "s1", store_name: "맛있는식당", description: "김치찌개 전문", city: "Pasig", district: "Ortigas" },
          { id: "s2", store_name: "Hardware", description: "tools", city: "김치", district: "x" },
        ],
        menus: [
          { id: "m1", title: "김치찌개", summary: "hot", store_name: "맛있는식당" },
          { id: "m2", title: "김밥", summary: "cold", store_name: "분식" },
        ],
      }),
    });
    const res = await searchDeliveryForGlobal("김치찌개", new AbortController().signal);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stores.map((s) => s.id)).toEqual(["s1"]);
    expect(res.menus.map((m) => m.id)).toEqual(["m1"]);
  });

  it("chat adapter: jamo/short lastMessage cannot hit a room; lastMessage match returns preview", () => {
    const rooms = [
      chatRoom({ id: "short", title: "peer", lastMessage: "go" }),
      chatRoom({ id: "jamo", title: "peer2", lastMessage: "ㄱ" }),
      chatRoom({ id: "ok", title: "peer3", lastMessage: "오늘 김치찌개 먹자" }),
    ];
    expect(filterMembershipRoomsForGlobalSearch(rooms, "go")).toEqual([]);
    expect(filterMembershipRoomsForGlobalSearch(rooms, "ㄱ")).toEqual([]);
    const hits = filterMembershipRoomsForGlobalSearch(rooms, "김치");
    expect(hits.map((h) => h.room.id)).toEqual(["ok"]);
    expect(hits[0]?.matchedField).toBe("lastMessage");
    expect(hits[0]?.preview).toContain("김치");
    expect(buildSearchHighlightSegments(hits[0]!.preview, "김치").some((s) => s.matched)).toBe(true);
  });
});

describe("D1–D6 Delivery keyword vs geo vs parent store", () => {
  it("D1 store_name match", () => {
    expect(matchDeliveryStoreGlobalSearch({ store_name: "맛있는식당", description: "" }, "맛있는").matchedField).toBe(
      "store_name"
    );
  });

  it("D2 description match", () => {
    expect(
      matchDeliveryStoreGlobalSearch({ store_name: "한식당", description: "김치찌개 맛집" }, "김치").matchedField
    ).toBe("description");
  });

  it("D3 city-only is not a keyword result", () => {
    expect(
      matchDeliveryStoreGlobalSearch(
        { store_name: "한식당", description: "분식" },
        "Pasig"
      ).matched
    ).toBe(false);
    expect(normalizeDeliveryKeyword("Pasig")?.keyword).toBe("Pasig");
  });

  it("D4 district-only is not a keyword result", () => {
    expect(matchDeliveryStoreGlobalSearch({ store_name: "한식당", description: "" }, "Ortigas").matched).toBe(false);
  });

  it("D5 menu title match", () => {
    expect(matchDeliveryMenuGlobalSearch({ title: "김치찌개", summary: "" }, "김치").matchedField).toBe("title");
  });

  it("D6 menu-only match does not promote parent store", () => {
    const store = matchDeliveryStoreGlobalSearch({ store_name: "맛있는식당", description: "분식 전문" }, "김치찌개");
    const menu = matchDeliveryMenuGlobalSearch({ title: "김치찌개", summary: "주메뉴" }, "김치찌개");
    expect(menu.matched).toBe(true);
    expect(store.matched).toBe(false);
    const engine = read("lib/delivery/search/search-delivery.ts");
    expect(engine).toContain('ilike_any: ["store_name", "description"]');
    expect(engine).not.toMatch(/region\.ilike/);
    expect(engine).not.toMatch(/city\.ilike/);
    expect(engine).not.toMatch(/district\.ilike/);
    expect(engine).toContain("Do not promote the parent into the keyword Store section");
    expect(engine).toContain("Keyword store hits only. Menu parents stay in deliveryStoreById");
  });
});

describe("Trade T5 / CUT C / IME / BottomNav / highlight render locks", () => {
  beforeEach(() => {
    payloadMock.mockReset();
  });

  it("trade server does not execute jamo or go, and filters Wigo inner-miss", async () => {
    const resGo = await fetchGlobalSearchTradeMatchOnlyPosts({} as SupabaseClient<any>, null, { q: "go" });
    expect(resGo).toEqual({ posts: [], hasMore: false });
    expect(payloadMock).not.toHaveBeenCalled();
    const resJamo = await fetchGlobalSearchTradeMatchOnlyPosts({} as SupabaseClient<any>, null, { q: "ㄱ" });
    expect(resJamo).toEqual({ posts: [], hasMore: false });

    payloadMock.mockResolvedValue({
      posts: [tradePostFixture("wigo", "Toyota Wigo"), tradePostFixture("going", "Going away")],
      hasMore: false,
    });
    const res = await fetchGlobalSearchTradeMatchOnlyPosts({} as SupabaseClient<any>, null, { q: "Wigo" });
    expect(res.posts.map((p) => p.id)).toEqual(["wigo"]);
  });

  it("CUT C / IME / BottomNav / exact return / highlight wiring preserved", () => {
    const gsServer = read("lib/search/global/trade-match-only-server.ts");
    expect(gsServer).not.toContain("takeSearchRankedWindowPage");
    expect(gsServer).toContain("matchTradeGlobalSearch");
    const bar = read("components/search/SearchInputBar.tsx");
    expect(bar).not.toContain("onCompositionStart");
    expect(bar).toContain("autoFocus = false");
    expect(bar).toContain("event.nativeEvent.isComposing");
    const view = read("components/search/global/GlobalSearchView.tsx");
    expect(view).toContain("domainOrder.map((domain) => renderDomain(domain))");
    expect(view).toContain("highlightQuery={activeQuery}");
    expect(view).toContain("data-global-search-entry-domain");
    expect(view).toContain("query={activeQuery}");
    expect(view).toContain("SearchHighlightText");
    expect(read("components/search/global/SearchHighlightText.tsx")).toContain("text-[var(--dibay-green)]");
    expect(read("components/layout/RegionBarMainHubTier1.tsx")).toContain('domain: "community"');
    expect(read("components/layout/RegionBarMainHubTier1.tsx")).toContain('domain: "trade"');
    expect(read("components/stores/home/hub/StoresConsumerHeaderActions.tsx")).toContain('domain: "delivery"');
    expect(read("components/community-messenger/CommunityMessengerHome.tsx")).toContain('domain: "chat"');
    expect(read("components/community-messenger/CommunityMessengerHeaderActions.tsx")).toContain(
      'data-global-search-open="chat"'
    );
    expect(isSearchableGlobalQuery("디바이")).toBe(true);
    expect(matchChatGlobalSearch({ title: "디바이", lastMessage: "" }, "디바이").matchedField).toBe("title");
  });
});
