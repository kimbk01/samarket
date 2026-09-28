import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  communityPostTextMatchesKeyword,
  sanitizeCommunityKeywordQuery,
} from "@/lib/community-feed/hashtag-discovery";
import { normalizeDeliveryKeyword } from "@/lib/delivery/search/search-delivery";
import { filterMembershipRoomsForGlobalSearch } from "@/lib/search/global/adapters/chat-search-adapter";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  inspectTradeTitleIlikeMatch,
  selectTitleIlikeMatched,
  tradePostFixture,
} from "@/lib/search/global/__tests__/trade-title-ilike-inspect";

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const NO_MATCH = "zzzz_dibay_no_match_92837";

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
    ...overrides,
  } as CommunityMessengerRoomSummary;
}

function inspectCommunityMatch(
  query: string,
  post: { id: string; title: string; content?: string; summary?: string }
) {
  const hit = communityPostTextMatchesKeyword(post, query);
  const keyword = sanitizeCommunityKeywordQuery(query).toLowerCase();
  const field = (["title", "content", "summary"] as const).find((key) =>
    (post[key] ?? "").toLowerCase().includes(keyword)
  );
  return {
    QUERY: query,
    RESULT_ID: post.id,
    TITLE: post.title,
    MATCH_FIELD: hit && field ? field : "NONE",
    MATCH_VALUE: hit && field ? (post[field] ?? "") : "",
  };
}

function inspectDeliveryStoreMatch(
  query: string,
  store: { id: string; store_name: string; description?: string | null }
) {
  const parsed = normalizeDeliveryKeyword(query);
  const hay = {
    store_name: store.store_name,
    description: store.description ?? "",
  };
  const field = parsed
    ? (["store_name", "description"] as const).find((key) =>
        hay[key].toLowerCase().includes(parsed.normalized)
      )
    : undefined;
  return {
    QUERY: query,
    RESULT_ID: store.id,
    TITLE: store.store_name,
    MATCH_FIELD: field ?? "NONE",
    MATCH_VALUE: field ? hay[field] : "",
  };
}

function inspectDeliveryMenuMatch(
  query: string,
  menu: { id: string; title: string; summary?: string | null }
) {
  const parsed = normalizeDeliveryKeyword(query);
  const hay = { title: menu.title, summary: menu.summary ?? "" };
  const field = parsed
    ? (["title", "summary"] as const).find((key) => hay[key].toLowerCase().includes(parsed.normalized))
    : undefined;
  return {
    QUERY: query,
    RESULT_ID: menu.id,
    TITLE: menu.title,
    MATCH_FIELD: field ?? "NONE",
    MATCH_VALUE: field ? hay[field] : "",
  };
}

describe("4-domain Global Search match-only contract", () => {
  it("COMMUNITY non-match → [] and known keyword matches searchable fields only", () => {
    const posts = [
      { id: "c1", title: "오늘 치킨 파티", content: "", summary: "" },
      { id: "c2", title: "분식 모임", content: "", summary: "" },
    ];
    expect(posts.filter((p) => communityPostTextMatchesKeyword(p, NO_MATCH))).toEqual([]);
    const hits = posts.filter((p) => communityPostTextMatchesKeyword(p, "치킨"));
    expect(hits.map((p) => p.id)).toEqual(["c1"]);
    expect(inspectCommunityMatch("치킨", posts[0]!)).toMatchObject({
      QUERY: "치킨",
      RESULT_ID: "c1",
      MATCH_FIELD: "title",
    });
    expect(inspectCommunityMatch("치킨", posts[1]!).MATCH_FIELD).toBe("NONE");
    const adapter = read("lib/search/global/adapters/community-search-adapter.ts");
    expect(adapter).toContain("sanitizeCommunityKeywordQuery");
    expect(adapter).toContain("q: keyword");
  });

  it("TRADE non-match → [] and known keyword matches title only", () => {
    const products = [
      tradePostFixture("t1", "Toyota Fortuner"),
      tradePostFixture("t2", "Samsung fridge"),
    ];
    expect(selectTitleIlikeMatched(NO_MATCH, products)).toEqual([]);
    const hits = selectTitleIlikeMatched("Fortuner", products);
    expect(hits.map((p) => p.id)).toEqual(["t1"]);
    expect(inspectTradeTitleIlikeMatch("Fortuner", products[0]!).MATCH_FIELD).toBe("title");
    expect(inspectTradeTitleIlikeMatch("Fortuner", products[1]!).MATCH_FIELD).toBe("NONE");
  });

  it("DELIVERY non-match → stores=[] menus=[] and known keyword matches ILIKE fields only", () => {
    expect(normalizeDeliveryKeyword(NO_MATCH)?.keyword).toBe("zzzzdibaynomatch92837");
    const stores = [
      { id: "s1", store_name: "Jollibee Ortigas", description: "fried chicken" },
      { id: "s2", store_name: "Hardware Depot", description: "tools" },
    ];
    const menus = [
      { id: "m1", title: "Chickenjoy", summary: "crispy" },
      { id: "m2", title: "Kimchi stew", summary: "hot" },
    ];
    expect(stores.filter((s) => inspectDeliveryStoreMatch(NO_MATCH, s).MATCH_FIELD !== "NONE")).toEqual([]);
    expect(menus.filter((m) => inspectDeliveryMenuMatch(NO_MATCH, m).MATCH_FIELD !== "NONE")).toEqual([]);
    expect(inspectDeliveryStoreMatch("Jollibee", stores[0]!)).toMatchObject({
      RESULT_ID: "s1",
      MATCH_FIELD: "store_name",
    });
    expect(inspectDeliveryStoreMatch("Jollibee", stores[1]!).MATCH_FIELD).toBe("NONE");
    expect(inspectDeliveryMenuMatch("Chickenjoy", menus[0]!).MATCH_FIELD).toBe("title");
    expect(inspectDeliveryMenuMatch("Chickenjoy", menus[1]!).MATCH_FIELD).toBe("NONE");
    const engine = read("lib/delivery/search/search-delivery.ts");
    expect(engine).toContain("store_name.ilike");
    expect(engine).toContain("title.ilike");
    expect(engine).not.toContain("featured-home-fallback");
    const adapter = read("lib/search/global/adapters/delivery-search-adapter.ts");
    expect(adapter).toContain("/api/stores/search");
  });

  it("CHAT non-match → [] and known keyword matches title/subtitle/summary/lastMessage only", () => {
    const rooms = [
      chatRoom({ id: "ch1", title: "치킨 모임", chatDomain: "general_direct" }),
      chatRoom({ id: "ch2", title: "분식", chatDomain: "general_direct" }),
    ];
    expect(filterMembershipRoomsForGlobalSearch(rooms, NO_MATCH)).toEqual([]);
    const hits = filterMembershipRoomsForGlobalSearch(rooms, "치킨");
    expect(hits.map((h) => h.room.id)).toEqual(["ch1"]);
  });
});
