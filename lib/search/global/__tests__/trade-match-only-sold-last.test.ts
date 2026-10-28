/**
 * 거래 §3 ④ 판매완료 맨 끝 이후 — 전역 검색 거래 칸은 일치 글만 고른다(첫 비일치에서 자르지 않는다).
 * 일치하는 판매완료 글은 비슷한·나머지 판매중 글 뒤에 오므로 잘려 나가면 안 된다.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/posts/home-posts-route-core", () => ({ resolveHomePostsGetData: vi.fn() }));

import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { resolveGlobalSearchTradeMatchOnly } from "@/lib/search/global/trade-match-only-server";

const dataMock = vi.mocked(resolveHomePostsGetData);

describe("전역 검색 거래 칸 — 판매완료 맨 끝", () => {
  it("비일치 판매중 글 뒤의 일치 판매완료 글도 포함", async () => {
    dataMock.mockResolvedValue({
      queryFailed: false,
      hasMore: false,
      posts: [
        { id: "a", list_section: "active" },
        { id: "b", list_section: "q:related|active" },
        { id: "c", list_section: "q:rest|active" },
        { id: "d", list_section: "sold" },
        { id: "e", list_section: "q:rest|sold" },
      ],
    } as never);
    const res = await resolveGlobalSearchTradeMatchOnly(new NextRequest("https://x.test/api/search?q=iphone"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.posts.map((p) => p.id)).toEqual(["a", "d"]);
    expect(res.hasMore).toBe(false);
  });
});
