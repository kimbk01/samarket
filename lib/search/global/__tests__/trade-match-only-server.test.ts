import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostWithMeta } from "@/lib/posts/schema";
import { tradePostFixture } from "@/lib/search/global/__tests__/trade-title-ilike-inspect";

vi.mock("@/lib/posts/home-posts-query-server", async (orig) => {
  const actual = await orig<typeof import("@/lib/posts/home-posts-query-server")>();
  return {
    ...actual,
    resolveHomePostsPayload: vi.fn(),
  };
});

vi.mock("@/lib/trade/trade-market-catalog", () => ({
  expandTradeCategoryIdsForAllConfiguredHomeRoots: vi.fn(async () => []),
}));

vi.mock("@/lib/posts/enrich-posts-author-nicknames", () => ({
  enrichPostsAuthorNicknamesFromProfiles: vi.fn(async () => undefined),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveHomePostsPayload } from "@/lib/posts/home-posts-query-server";
import { fetchGlobalSearchTradeMatchOnlyPosts } from "@/lib/search/global/trade-match-only-server";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";

const payloadMock = vi.mocked(resolveHomePostsPayload);

function fakeSb(): SupabaseClient<any> {
  return {} as SupabaseClient<any>;
}

describe("Global Search Trade match-only server fetch", () => {
  beforeEach(() => {
    payloadMock.mockReset();
  });

  it("empty query does not hit discovery payload", async () => {
    const res = await fetchGlobalSearchTradeMatchOnlyPosts(fakeSb(), null, { q: "   " });
    expect(res).toEqual({ posts: [], hasMore: false });
    expect(payloadMock).not.toHaveBeenCalled();
  });

  it("passes sanitized q into resolveHomePostsPayload and never expansion", async () => {
    const posts: PostWithMeta[] = [tradePostFixture("fortuner", "Toyota Fortuner")];
    payloadMock.mockResolvedValue({ posts, hasMore: false });
    const res = await fetchGlobalSearchTradeMatchOnlyPosts(fakeSb(), null, {
      q: "  Fortuner  ",
      lguCityId: "pasig",
      radiusKm: null,
    });
    expect(res.posts.map((p) => p.id)).toEqual(["fortuner"]);
    expect(payloadMock).toHaveBeenCalledTimes(1);
    const extras = payloadMock.mock.calls[0]?.[9] as { q?: string };
    expect(extras?.q).toBe("Fortuner");
    const lgu = payloadMock.mock.calls[0]?.[7];
    expect(lgu).toBe("pasig");
  });

  it("Q0 no-match payload stays empty", async () => {
    payloadMock.mockResolvedValue({ posts: [], hasMore: false });
    const res = await fetchGlobalSearchTradeMatchOnlyPosts(fakeSb(), null, {
      q: "zzzz_dibay_no_match_92837",
      lguCityId: null,
    });
    expect(res.posts).toEqual([]);
    expect(payloadMock.mock.calls[0]?.[9]).toMatchObject({
      q: sanitizeMarketplaceQueryText("zzzz_dibay_no_match_92837"),
    });
  });
});
