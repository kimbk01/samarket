/**
 * 커뮤니티 상위노출 표시 재설계 (Owner 2026-11-04 「배경 + 글자」) — 동작 시험.
 * 1) 회원 화면 응답에 남은 기간이 없다 · 위쪽 고정 글은 일반 목록과 같은 카드 값(feedPost)을 받는다
 * 2) 상위노출 카드 = 일반 글과 같은 카드 + 배경 + 「포인트 노출」 · 일반 글은 배경·글자 없음
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const fetchCanonical = vi.fn();
const fetchLegacy = vi.fn();
const listFeed = vi.fn();

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
vi.mock("@/lib/promotion/community-paid-exposure-feed", () => ({
  fetchActiveCommunityPaidExposureFeedPosts: (...a: unknown[]) => fetchCanonical(...a),
}));
vi.mock("@/lib/ads/post-ads-supabase", () => ({
  fetchActiveTopFixedAdFeedPostsFromDb: (...a: unknown[]) => fetchLegacy(...a),
}));
vi.mock("@/lib/neighborhood/queries", () => ({
  listNeighborhoodFeed: (...a: unknown[]) => listFeed(...a),
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => "viewer-1",
}));
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
    t: (k: string, vars?: Record<string, string>) => {
      const s = String(translate("ko", k as MessageKey) ?? k);
      return vars ? Object.entries(vars).reduce((acc, [kk, vv]) => acc.replace(`{${kk}}`, vv), s) : s;
    },
    safeT: (k: string, o?: { fallbackKo?: string }) => translate("ko", k as MessageKey) || o?.fallbackKo || k,
    tt: (x: string) => x,
  }),
}));

import { GET } from "@/app/api/ads/active/route";
import { CommunityCard } from "@/components/community/CommunityCard";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

const feedPost = {
  id: "post-1",
  title: "상위노출 글",
  summary: "요약",
  content: "본문",
  author_name: "작성자A",
  region_label: "Pasig",
  view_count: 37,
  comment_count: 2,
  like_count: 1,
  created_at: "2026-11-04T00:00:00Z",
  published_at: "2026-11-04T00:00:00Z",
  images: [],
  category: "free",
  topic_slug: "free",
} as unknown as NeighborhoodFeedPostDTO;

beforeEach(() => {
  vi.clearAllMocks();
  fetchLegacy.mockResolvedValue({ ok: true, ads: [] });
});

describe("/api/ads/active — 남은 기간 없음 · 일반 카드 값", () => {
  it("endAt 을 싣지 않고, 같은 조회 함수로 받은 카드 값을 붙인다 (보는 회원 기준)", async () => {
    fetchCanonical.mockResolvedValue({
      ok: true,
      ads: [
        { adId: "o1", postId: "post-1", postTitle: "t", postSummary: "", postImages: [], locationLabel: "", boardKey: "plife", adType: "top_fixed", priority: 0, startAt: "2026-11-04T01:00:00Z", endAt: "2026-11-07T01:00:00Z", advertiserName: "작성자A" },
        { adId: "o2", postId: "post-blocked", postTitle: "t2", postSummary: "", postImages: [], locationLabel: "", boardKey: "plife", adType: "top_fixed", priority: 0, startAt: "2026-11-04T00:00:00Z", endAt: "2026-11-07T00:00:00Z", advertiserName: "B" },
      ],
    });
    listFeed.mockResolvedValue({ posts: [feedPost], hasMore: false, dbScannedCount: 1, pagingOffsetAdvance: 1 });
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("https://x.test/api/ads/active?boardKey=plife"));
    const j = (await res.json()) as { ads: Array<Record<string, unknown>> };
    expect(listFeed).toHaveBeenCalledWith(
      expect.objectContaining({ allLocations: true, postIds: ["post-1", "post-blocked"], viewerUserId: "viewer-1" })
    );
    expect(j.ads).toHaveLength(2);
    for (const ad of j.ads) expect(ad).not.toHaveProperty("endAt");
    expect(JSON.stringify(j)).not.toContain("2026-11-07");
    expect(j.ads[0]!.feedPost).toMatchObject({ id: "post-1", view_count: 37 });
    expect(j.ads[1]!.feedPost).toBeNull(); // 보는 회원에게 안 보이는 글(차단 등) = 카드 값 없음 → 화면이 자리를 주지 않는다
  });
});

describe("카드 — 일반 글과 같은 카드, 배경 + 「포인트 노출」만 다르다", () => {
  it("상위노출 글: 같은 작성자·조회수 칸 + 배경 표시 + 「포인트 노출」 · 남은 기간 문구 없음", () => {
    const html = renderToStaticMarkup(<CommunityCard post={feedPost} isAd />);
    expect(html).toContain('data-community-boosted="1"');
    expect(html).toContain("!bg-[var(--sam-boost-card-bg)]");
    expect(html).toContain("포인트 노출");
    expect(html).not.toMatch(/일 남음|오늘 만료|내일 만료/);
    const normal = renderToStaticMarkup(<CommunityCard post={feedPost} />);
    expect(normal).not.toContain("data-community-boosted");
    expect(normal).not.toContain("포인트 노출");
    // 배경·글자 칸을 빼면 같은 카드다 (작성자·조회수 등 같은 칸)
    const strip = (h: string) =>
      h
        .replace(/ data-community-boosted="1"/, "")
        .replace(" !bg-[var(--sam-boost-card-bg)]", "")
        .replace(/<span[^>]*data-community-ad-badge=""[^>]*>[^<]*<\/span>/, "")
        .replace(/<div class="mb-1\.5 flex w-full min-w-0 items-center gap-1\.5"><\/div>/, "");
    expect(strip(html)).toBe(strip(normal));
  });
});
