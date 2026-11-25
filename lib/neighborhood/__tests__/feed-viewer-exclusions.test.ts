import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFeedViewerExclusions } from "@/lib/neighborhood/feed-viewer-exclusions.server";
import { SOCIAL_BLOCK_ACTIVE_OR_LEGACY } from "@/lib/social/block-ssot-types";

/**
 * 2026-11-25 S4 — 동네 피드 로그인 사용자 제외 목록(차단 작성자·숨긴 글) DB 함수 1번.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/budget-alert-defects-design-2026-11-24.md D5·S4
 */
function sbWith(result: unknown) {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    calls,
    sb: {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return result;
      },
    } as never,
  };
}

describe("loadFeedViewerExclusions", () => {
  it("한 번 호출로 차단 작성자·숨긴 글 집합", async () => {
    const { sb, calls } = sbWith({
      data: { blocked_user_ids: ["u-2", " u-3 ", ""], hidden_post_ids: ["p-1"] },
      error: null,
    });
    const r = await loadFeedViewerExclusions(sb, " u-1 ");
    expect(calls).toEqual([{ name: "neighborhood_feed_viewer_exclusions", args: { p_viewer: "u-1" } }]);
    expect(r && [...r.blockedAuthorIds].sort()).toEqual(["u-2", "u-3"]);
    expect(r && [...r.hiddenPostIds]).toEqual(["p-1"]);
  });

  it.each([
    ["함수 오류", { data: null, error: { message: "function does not exist" } }],
    ["형식 이상(배열 아님)", { data: { blocked_user_ids: "x", hidden_post_ids: [] }, error: null }],
    ["빈 응답", { data: null, error: null }],
  ])("%s → null (호출자가 기존 두 조회로)", async (_l, result) => {
    const { sb } = sbWith(result);
    expect(await loadFeedViewerExclusions(sb, "u-1")).toBeNull();
  });

  it("rpc 가 없는 클라이언트(시험 흉내 등) → null", async () => {
    expect(await loadFeedViewerExclusions({} as never, "u-1")).toBeNull();
  });

  it("뷰어 없음 → 호출하지 않음", async () => {
    const { sb, calls } = sbWith({ data: {}, error: null });
    expect(await loadFeedViewerExclusions(sb, "  ")).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("neighborhood_feed_viewer_exclusions 마이그레이션 계약", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20271125110000_neighborhood_feed_viewer_exclusions.sql"),
    "utf8"
  );

  it("차단 조건 = fetchBlockedAuthorIdsForViewerSb (blocked · 양방향 · is_active null 또는 true)", () => {
    expect(SOCIAL_BLOCK_ACTIVE_OR_LEGACY).toBe("is_active.is.null,is_active.eq.true");
    expect(sql).toContain("r.relation_type = 'blocked'");
    expect(sql).toContain("(r.owner_user_id = p_viewer or r.target_user_id = p_viewer)");
    expect(sql).toContain("(r.is_active is null or r.is_active = true)");
    expect(sql).toContain("case when r.owner_user_id = p_viewer then r.target_user_id else r.owner_user_id end");
  });

  it("숨긴 글 조건 = community_post_hides user_id = 뷰어", () => {
    expect(sql).toMatch(/from public\.community_post_hides h\s+where h\.user_id = p_viewer/);
  });

  it("실행 권한 service_role 만 · security invoker", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain(
      "revoke all on function public.neighborhood_feed_viewer_exclusions(uuid) from public, anon, authenticated;"
    );
    expect(sql).toContain("grant execute on function public.neighborhood_feed_viewer_exclusions(uuid) to service_role;");
  });

  it("동네 피드 목록이 1회 조회를 쓰고, 실패 시 기존 두 조회가 남아 있다", () => {
    const src = readFileSync(join(process.cwd(), "lib/neighborhood/queries.ts"), "utf8");
    expect(src).toContain("loadFeedViewerExclusions(sb, v)");
    expect(src).toContain("fetchBlockedAuthorIdsForViewer(sb, v, collectPerf ? blockedMetrics : undefined)");
    expect(src).toContain('.from("community_post_hides")');
  });
});
