import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TRADE_FAVORITE_HIDDEN_MODERATION,
  countVisibleTradeFavoritesServer,
} from "@/lib/favorites/load-favorite-posts-server";

/** 3차 실기 2-5 근본 수정 H1 (docs/audit/trade-r3-fail-root-cause-design-2026-11-04.md · Owner 「설계안 승인」 2026-11-04) */
const src = (p: string) => readFileSync(p, "utf8");

describe("「내 거래 찜 개수」 정의 1곳", () => {
  it("찜 ⨝ 글 inner join 한 번 · 관리자 삭제 글 제외 · 실패면 null", async () => {
    const calls: unknown[][] = [];
    const chain = {
      select: (...a: unknown[]) => (calls.push(["select", ...a]), chain),
      eq: (...a: unknown[]) => (calls.push(["eq", ...a]), chain),
      neq: (...a: unknown[]) => (calls.push(["neq", ...a]), Promise.resolve({ count: 3, error: null })),
    };
    const sb = { from: (t: string) => (calls.push(["from", t]), chain) };
    expect(await countVisibleTradeFavoritesServer(sb as never, "u1")).toBe(3);
    expect(calls).toEqual([
      ["from", "favorites"],
      ["select", "id, posts!inner(moderation_state)", { count: "exact", head: true }],
      ["eq", "user_id", "u1"],
      ["neq", "posts.moderation_state", "admin_deleted"],
    ]);
    const bad = {
      from: () => ({ select: () => ({ eq: () => ({ neq: () => Promise.resolve({ count: null, error: { message: "x" } }) }) }) }),
    };
    expect(await countVisibleTradeFavoritesServer(bad as never, "u1")).toBeNull();
    expect(TRADE_FAVORITE_HIDDEN_MODERATION).toBe("admin_deleted");
  });

  it("찜 화면 맨 위 개수·내정보 대시보드가 같은 함수를 쓴다(따로 세지 않음)", () => {
    const count = src("app/api/favorites/count/route.ts");
    expect(count).toContain("countVisibleTradeFavoritesServer(getSupabaseServer(), userId)");
    expect(count).not.toContain('.from("favorites")');
    const dash = src("lib/my/load-mypage-home-dashboard-counts-server.ts");
    expect(dash).toContain("countVisibleTradeFavoritesServer(getSupabaseServer(), userId)");
    expect(dash).not.toContain('.from("favorites")');
    /** 목록·칩 개수도 같은 규칙 상수 */
    expect(src("lib/favorites/load-favorite-posts-server.ts")).toContain(
      '.eq("moderation_state", TRADE_FAVORITE_HIDDEN_MODERATION)'
    );
  });

  it("재발 방지: favorites 표를 읽는 파일은 용도가 정해진 아래 목록뿐(새로 세는 곳이 생기면 실패)", () => {
    const out = execSync(`git grep -l 'from("favorites")' -- app lib services components hooks`, { encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("__tests__"))
      .sort();
    expect(out).toEqual(
      [
        "app/api/admin/stats/summary/route.ts", // 관리자 통계(전체 찜 수)
        "app/api/favorites/status/route.ts", // 글 1개 하트 상태
        "app/api/favorites/toggle/route.ts", // 찜 넣기·빼기
        "app/api/posts/listing-visibility/route.ts", // 목록 하트 상태
        "lib/favorites/load-favorite-posts-server.ts", // 「내 거래 찜」 목록·개수 정의 1곳
        "lib/posts/fetch-favorite-map-for-post-ids.ts", // 하트 상태
        "lib/posts/home-posts-route-core.ts", // 하트 상태
        "lib/posts/post-favorite-count-server.ts", // 글 1개의 「관심 N」
      ].sort()
    );
  });
});
