/**
 * 광고 ② 커뮤니티 (2026-11-04) — 동작 시험.
 * PB-21: 광고 21개 → 위쪽 1개(Owner 2026-11-05) + 나머지(21번째 포함)는 일반 자리에 「포인트 노출」
 * PB-22: 운영 고정 글도 광고 중이면 운영 고정 칩 + 「포인트 노출」 둘 다
 * DS-1: 상위노출 카드는 항상 글 상세로(방·모임으로 보내지 않음) · 일반 카드는 그대로
 * D-29: 검색어(tag·q)가 있으면 피드 배너 없음
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";

vi.mock("@domain/philife/paths", async () => await import("@/lib/philife/paths"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: () => {}, push: () => {} }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    language: "ko",
    t: (k: string) => String(translate("ko", k as MessageKey) ?? k),
    safeT: (k: string, o?: { fallbackKo?: string }) => translate("ko", k as MessageKey) || o?.fallbackKo || k,
    tt: (x: string) => x,
  }),
}));

import { CommunityCard } from "@/components/community/CommunityCard";
import {
  communityFeedBannerAllowedForSearch,
  planCommunityFeedAdPlacement,
} from "@/lib/promotion/community-feed-ad-placement";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

const base = {
  id: "post-1",
  title: "글",
  summary: "요약",
  content: "본문",
  author_name: "작성자",
  region_label: "Pasig",
  view_count: 1,
  comment_count: 0,
  like_count: 0,
  created_at: "2026-11-04T00:00:00Z",
  published_at: "2026-11-04T00:00:00Z",
  images: [],
  category: "free",
  topic_slug: "free",
} as unknown as NeighborhoodFeedPostDTO;
const post = (over: Partial<NeighborhoodFeedPostDTO>) => ({ ...base, ...over }) as NeighborhoodFeedPostDTO;
const hrefOf = (html: string) => /href="([^"]+)"/.exec(html)?.[1] ?? "";

describe("PB-21 · PB-22 자리 계산", () => {
  it("광고 21개(위쪽 1개만 카드 값 · Owner 2026-11-05) → 위쪽 1개 · 2번째·21번째 글도 일반 자리에서 광고 표시", () => {
    const topAds = Array.from({ length: 21 }, (_, i) => ({
      adId: `p${i + 1}`,
      postId: `p${i + 1}`,
      feedPost: i < 1 ? post({ id: `p${i + 1}` }) : null,
    }));
    const posts = [post({ id: "p1" }), post({ id: "p2" }), post({ id: "p21" }), post({ id: "n1" })];
    const r = planCommunityFeedAdPlacement({ posts, topAds });
    expect(r.topAdsBelowOperator.map((a) => a.postId)).toEqual(["p1"]);
    expect(r.postsForList.map((p) => p.id)).toEqual(["p2", "p21", "n1"]); // 위쪽 글은 일반 목록에서 빠진다
    expect(r.activeAdPostIds.has("p2")).toBe(true);
    expect(r.activeAdPostIds.has("p21")).toBe(true);
    expect(r.activeAdPostIds.has("n1")).toBe(false);
  });

  it("카드 값이 여러 개 와도 위쪽은 1개만 (PROMOTED_TOP_PINS_MAX)", () => {
    const topAds = ["a1", "a2"].map((id) => ({ adId: id, postId: id, feedPost: post({ id }) }));
    const r = planCommunityFeedAdPlacement({ posts: [post({ id: "a2" }), post({ id: "n1" })], topAds });
    expect(r.topAdsBelowOperator.map((a) => a.postId)).toEqual(["a1"]);
    expect(r.postsForList.map((p) => p.id)).toEqual(["a2", "n1"]);
  });

  it("운영 고정 글이 광고 중이면 위쪽 광고 자리는 다른 글이 차지하고, 운영 고정 글도 광고로 판정된다", () => {
    const topAds = [
      { adId: "pin", postId: "pin", feedPost: post({ id: "pin" }) },
      { adId: "a2", postId: "a2", feedPost: post({ id: "a2" }) },
    ];
    const posts = [post({ id: "pin", is_pinned: true }), post({ id: "a2" }), post({ id: "n1" })];
    const r = planCommunityFeedAdPlacement({ posts, topAds });
    expect(r.operatorTopPosts.map((p) => p.id)).toEqual(["pin"]);
    expect(r.topAdsBelowOperator.map((a) => a.postId)).toEqual(["a2"]);
    expect(r.activeAdPostIds.has("pin")).toBe(true);
  });

  it("운영 고정 + 광고 카드 = 운영 고정 칩과 「포인트 노출」이 함께 보인다", () => {
    const html = renderToStaticMarkup(<CommunityCard post={post({ id: "pin", is_pinned: true })} isAd />);
    expect(html).toContain("포인트 노출");
    expect(html).toContain("data-community-ad-badge");
    expect(html).toContain('data-community-top-badge="pinned"');
    const plain = renderToStaticMarkup(<CommunityCard post={post({ id: "pin", is_pinned: true })} />);
    expect(plain).toContain('data-community-top-badge="pinned"');
    expect(plain).not.toContain("포인트 노출");
  });
});

describe("DS-1 상위노출 카드 이동", () => {
  it("메신저 방 연결 글: 상위노출이면 글 상세, 일반이면 방", () => {
    const p = post({ id: "post-9", community_messenger_room_id: "room-1" } as Partial<NeighborhoodFeedPostDTO>);
    expect(hrefOf(renderToStaticMarkup(<CommunityCard post={p} isAd />))).toBe("/philife/post-9");
    expect(hrefOf(renderToStaticMarkup(<CommunityCard post={p} />))).toBe("/community-messenger/rooms/room-1");
  });

  it("모임 글: 상위노출이면 글 상세, 일반이면 모임", () => {
    const p = post({ id: "post-8", is_meetup: true, meeting_id: "meet-1" } as Partial<NeighborhoodFeedPostDTO>);
    expect(hrefOf(renderToStaticMarkup(<CommunityCard post={p} isAd />))).toBe("/philife/post-8");
    expect(hrefOf(renderToStaticMarkup(<CommunityCard post={p} />))).not.toBe("/philife/post-8");
  });
});

describe("D-29 검색어가 있으면 피드 배너 없음", () => {
  it("tag·q 둘 다 없을 때만 배너를 끼운다", () => {
    expect(communityFeedBannerAllowedForSearch({ tag: null, q: null })).toBe(true);
    expect(communityFeedBannerAllowedForSearch({ tag: "", q: "  " })).toBe(true);
    expect(communityFeedBannerAllowedForSearch({ tag: "맛집", q: null })).toBe(false);
    expect(communityFeedBannerAllowedForSearch({ tag: null, q: "아이폰" })).toBe(false);
  });
});
