import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * 순서 7 — 커뮤니티 글 「내 상태」 DB 함수 1회 · 글 상세 출처 열 합치기 · 모임 헛조회 제거.
 */
vi.mock("@/lib/community-messenger/social-relations", () => ({
  isBlockedEitherWay: vi.fn(async () => false),
}));

import { fetchCommunityPostViewerStatesBatch } from "@/lib/community/post-engagement/viewer-state";

function legacyTableClient(log: string[]) {
  return {
    from(table: string) {
      log.push(table);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or"]) q[m] = () => q;
      q.in = async () => ({ data: [], error: null });
      return q;
    },
  };
}

describe("순서 7 fetchCommunityPostViewerStatesBatch", () => {
  it("함수 1회 · 표 조회 0 · 글별 상태 조립", async () => {
    const log: string[] = [];
    const rpc = vi.fn(async () => ({
      data: { liked: ["p1"], saved: ["p2"], hidden: [], reported: ["p1"], following: ["a2"], blocked: ["a1"] },
      error: null,
    }));
    const sb = { ...legacyTableClient(log), rpc } as never;
    const out = await fetchCommunityPostViewerStatesBatch(sb, "me", ["p1", "p2"], new Map([["p1", "a1"], ["p2", "a2"]]));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("community_post_viewer_states", {
      p_user_id: "me",
      p_post_ids: ["p1", "p2"],
      p_author_ids: ["a1", "a2"],
    });
    expect(log).toEqual([]);
    expect(out.get("p1")).toEqual({
      liked_by_viewer: true,
      saved_by_viewer: false,
      hidden_by_viewer: false,
      following_author: false,
      blocked_author: true,
      reported_by_viewer: true,
    });
    expect(out.get("p2")).toMatchObject({ saved_by_viewer: true, following_author: true, blocked_author: false });
  });

  it("작성자 미전달 → 팔로우·차단 빈 값 (기존과 같음)", async () => {
    const rpc = vi.fn(async () => ({
      data: { liked: [], saved: [], hidden: [], reported: [], following: ["a1"], blocked: ["a1"] },
      error: null,
    }));
    const out = await fetchCommunityPostViewerStatesBatch({ ...legacyTableClient([]), rpc } as never, "me", ["p1"]);
    expect(out.get("p1")).toMatchObject({ following_author: false, blocked_author: false });
  });

  it("함수 오류·예외 → 기존 표별 조회", async () => {
    for (const rpc of [
      vi.fn(async () => ({ data: null, error: { message: "missing" } })),
      vi.fn(async () => {
        throw new Error("boom");
      }),
    ]) {
      const log: string[] = [];
      await fetchCommunityPostViewerStatesBatch({ ...legacyTableClient(log), rpc } as never, "me", ["p1"], new Map([["p1", "a1"]]));
      expect(log.sort()).toEqual(
        ["community_post_hides", "community_post_likes", "community_post_saves", "community_reports", "user_relationships"].sort()
      );
    }
  });
});

describe("순서 7 글 상세 조회 (소스 계약)", () => {
  const src = readFileSync(resolve(process.cwd(), "lib/neighborhood/queries.ts"), "utf8");
  it("모임 「id 만」 재조회는 앞 조회 오류일 때만", () => {
    expect(src).toContain('if (!data && error) {\n    ({ data } = await trySelect("id"));');
  });
  it("본문 조회에 출처 열 포함 · 성공하면 별도 출처 조회 없음", () => {
    expect(src).toContain("fetchDetailRow(DETAIL_SELECT_FULL + POST_DETAIL_EXTRAS_SELECT_TAIL)");
    expect(src).toContain("? Promise.resolve(postExtrasFromCommunityPostRow(row, true))");
  });
});
