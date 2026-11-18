import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 2026-11-19 — 동네 피드 community_posts 2.0회/요청 → 상단 후보는 서버 공유 캐시 */
const revalidateTag = vi.fn();
const rows = [{ id: "p1", is_notice: true }];
let fail = false;
const limit = vi.fn(async () => (fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null }));
vi.mock("next/cache", () => ({
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => ({ select: () => ({ eq: () => ({ or: () => ({ limit }) }) }) }),
  }),
}));

import {
  COMMUNITY_FEED_TOP_CANDIDATES_CACHE_TAG,
  invalidateCommunityFeedTopCandidatesCache,
  loadCommunityFeedTopCandidatesShared,
} from "@/lib/community-feed/community-feed-top-candidates-cache.server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("동네 피드 상단 후보 공유 캐시", () => {
  beforeEach(() => {
    fail = false;
    vi.clearAllMocks();
  });

  it("후보 행을 돌려주고, 읽기 실패는 캐시하지 않고 빈 목록(기존 동작)", async () => {
    expect(await loadCommunityFeedTopCandidatesShared("id, title", "active")).toEqual(rows);
    fail = true;
    expect(await loadCommunityFeedTopCandidatesShared("id, title", "active")).toEqual([]);
  });

  it("관리자 저장 시 태그 즉시 만료", () => {
    invalidateCommunityFeedTopCandidatesCache();
    expect(revalidateTag).toHaveBeenCalledWith(COMMUNITY_FEED_TOP_CANDIDATES_CACHE_TAG, { expire: 0 });
  });

  it("피드는 공유 캐시를 쓰고, 노출 판정은 현재 시각으로 다시 거른다", () => {
    const q = read("lib/neighborhood/queries.ts");
    expect(q).toContain("loadCommunityFeedTopCandidatesShared(FEED_SELECT_FULL, COMMUNITY_POST_FEED_STATUS_ACTIVE)");
    expect(q).not.toMatch(/\.or\(communityFeedTopCandidatesOrFilter/);
    expect(q).toContain("topNowMs");
  });

  it("공지 생성·종료·수정, 고정 변경이 캐시를 만료", () => {
    expect(read("lib/admin/community-admin/community-post-pin.ts")).toContain("invalidateCommunityFeedTopCandidatesCache();");
    expect(read("lib/admin/community-admin/community-post-admin-patch.ts")).toContain("invalidateCommunityFeedTopCandidatesCache();");
    expect(read("app/api/admin/community/notices/route.ts")).toContain("invalidateCommunityFeedTopCandidatesCache();");
    expect(read("app/api/admin/community/notices/[postId]/route.ts")).toContain("invalidateCommunityFeedTopCandidatesCache();");
  });
});
