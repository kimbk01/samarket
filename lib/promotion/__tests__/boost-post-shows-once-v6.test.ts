/**
 * Owner 고정 (2026-11-07): 「상위 노출 부분은 커뮤니티든 거래든 모두 1개 게시물에 하나만 올라오는 거다.
 * 일반에도 있고 광고에도 있고 하는 부분이 아니다.」
 * → 상위노출 글은 한 목록에 한 번만: 위쪽 자리에 나오면 일반 자리(어느 페이지든)에는 없다.
 * 실기 v6 FAIL 설계(docs/audit/ads-v6-device-fail-design-2026-11-07.md §0) 회귀 고정.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectTradeFeedWithPromotions } from "@/lib/promotion/feed-promotion-projection";
import { planCommunityFeedAdPlacement } from "@/lib/promotion/community-feed-ad-placement";
import type { PostWithMeta } from "@/lib/posts/schema";

const post = (id: string): PostWithMeta =>
  ({ id, status: "active", seller_listing_state: null, title: id, list_section: "" }) as unknown as PostWithMeta;

const countIds = (ids: string[]) => ids.reduce<Record<string, number>>((m, id) => ((m[id] = (m[id] ?? 0) + 1), m), {});

describe("거래 — 상위노출 글 1회", () => {
  it("1페이지: 위쪽에 끼운 글은 일반 자리에서 빠진다(같은 글 2번 0)", () => {
    const normal = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
    const promoted = [post("p3"), post("p7")];
    const out = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: normal,
      promotedPosts: promoted,
      activePromotionIds: new Set(["p3", "p7"]),
      organicPageSize: 10,
    });
    const counts = countIds(out.posts.map((p) => p.id));
    expect(Object.values(counts).every((n) => n === 1)).toBe(true);
    for (const id of out.promotedIdsOnPage) expect(counts[id]).toBe(1);
  });

  it("2페이지 이후: 앞 페이지에 나온 글은 붙일 때 빠진다 (홈·카테고리 목록 append 가 id 로 거른다)", () => {
    for (const f of ["components/home/HomeProductList.tsx", "components/post/PostListByCategory.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).toMatch(/const seen = new Set\(prev\.map\(\(p\) => p\.id\)\)/);
      expect(src).toMatch(/!seen\.has\(/);
    }
  });
});

describe("커뮤니티 — 상위노출 글 1회", () => {
  it("위쪽 자리 글은 일반 목록 전체(불러온 모든 페이지)에서 빠진다", () => {
    const posts = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}` }));
    const topAds = [{ postId: "c5", feedPost: { id: "c5" } }];
    const plan = planCommunityFeedAdPlacement({ posts, topAds });
    const shown = [
      ...plan.topAdsBelowOperator.map((a) => String(a.postId)),
      ...plan.postsForList.map((p) => String(p.id)),
    ];
    expect(countIds(shown).c5).toBe(1);
    expect(plan.postsForList.some((p) => p.id === "c5")).toBe(false);
  });
});
