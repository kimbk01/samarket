/**
 * Owner 결정 1 — 피드가 차단·관심이웃 목록을 못 읽으면 503 JSON (예전: 빈 목록 또는 서버 기본 500 HTML)
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
/** 바깥(운영) 요청 없이 — 주제 목록은 빈 값 */
vi.mock("@/lib/neighborhood/philife-neighborhood-topics", () => ({
  isPhilifeFeedCategorySlugAllowedByTopics: () => true,
  loadPhilifeDefaultSectionTopics: async () => [],
  peekLastPhilifeTopicsColdMetrics: () => null,
}));
vi.mock("@/lib/neighborhood/queries", async (orig) => {
  const real = await orig<typeof import("@/lib/neighborhood/queries")>();
  const { SocialExclusionLookupError } = await import("@/lib/social/user-block-ssot");
  return {
    ...real,
    listNeighborhoodFeed: async () => {
      throw new SocialExclusionLookupError("blocked_author_ids", { message: "timeout" });
    },
  };
});

describe("라운지 피드 — 차단 목록 조회 실패", () => {
  it("503 feed_viewer_filter_failed (JSON)", async () => {
    const { GET } = await import("@/app/api/community/neighborhood-feed/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/community/neighborhood-feed?globalFeed=1&neighborOnly=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "feed_viewer_filter_failed" });
  });
});
