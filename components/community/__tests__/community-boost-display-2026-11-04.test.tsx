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
  fetchActiveCommunityPromotedPostIds: (...a: unknown[]) => fetchCanonical(...a),
}));
const ensureLocation = vi.fn();
vi.mock("@/lib/neighborhood/ensure-location", () => ({
  ensureLocationId: (...a: unknown[]) => ensureLocation(...a),
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

const FORBIDDEN_KEYS = ["endAt", "startAt", "priority", "postTitle", "advertiserName", "boardKey", "adType"];

async function callActive(qs = "boardKey=plife") {
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`https://x.test/api/ads/active?${qs}`));
  return (await res.json()) as { ads: Array<Record<string, unknown>> };
}

describe("/api/ads/active — 남은 기간·결제 시각·순위 없음 · 일반 카드 값 (PV-4)", () => {
  it("endAt·startAt·priority 를 싣지 않고, adId = 글 id · 같은 조회 함수로 받은 카드 값을 붙인다 (보는 회원 기준)", async () => {
    fetchCanonical.mockResolvedValue({
      ok: true,
      truncated: false,
      items: [
        { postId: "post-1", startAt: "2026-11-04T01:00:00Z" },
        { postId: "post-blocked", startAt: "2026-11-04T00:00:00Z" },
      ],
    });
    listFeed.mockResolvedValue({ posts: [feedPost], hasMore: false, dbScannedCount: 1, pagingOffsetAdvance: 1 });
    const j = await callActive();
    expect(listFeed).toHaveBeenCalledWith(
      expect.objectContaining({ allLocations: true, postIds: ["post-1", "post-blocked"], viewerUserId: "viewer-1" })
    );
    expect(j.ads).toHaveLength(2);
    for (const ad of j.ads) {
      for (const k of FORBIDDEN_KEYS) expect(ad).not.toHaveProperty(k);
      expect(ad.adId).toBe(ad.postId);
    }
    expect(Object.keys(j.ads[0]!).sort()).toEqual(["adId", "feedPost", "postId"]);
    expect(JSON.stringify(j)).not.toContain("2026-11-04T01:00:00Z");
    expect(j.ads[0]!.feedPost).toMatchObject({ id: "post-1", view_count: 37 });
    expect(j.ads[1]!.feedPost).toBeNull(); // 보는 회원에게 안 보이는 글(차단 등) = 카드 값 없음 → 화면이 자리를 주지 않는다
  });

  it("PB-21: 광고 21개 → 21개 모두 싣고, 위쪽 1개만 카드 값(Owner 2026-11-05) · 21번째도 id 로 온다", async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ postId: `p${i + 1}`, startAt: "2026-11-04T00:00:00Z" }));
    fetchCanonical.mockResolvedValue({ ok: true, truncated: false, items });
    listFeed.mockImplementation(async (o: { postIds: string[] }) => ({
      posts: o.postIds.map((id) => ({ ...feedPost, id })),
      hasMore: false,
      dbScannedCount: 0,
      pagingOffsetAdvance: 0,
    }));
    const j = await callActive();
    expect(j.ads).toHaveLength(21);
    expect(j.ads.map((a) => a.postId)).toEqual(items.map((i) => i.postId));
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["p1"]);
    expect(j.ads[1]).toEqual({ adId: "p2", postId: "p2", feedPost: null });
    expect(j.ads[20]).toEqual({ adId: "p21", postId: "p21", feedPost: null });
  });

  it("PB-21: 위쪽 후보가 보는 회원에게 안 보이면 다음 글로 채운다 (1개까지)", async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ postId: `p${i + 1}`, startAt: "x" }));
    fetchCanonical.mockResolvedValue({ ok: true, truncated: false, items });
    // 앞 20개는 전부 안 보임 → 두 번째 묶음에서 채운다
    listFeed.mockImplementation(async (o: { postIds: string[] }) => ({
      posts: o.postIds.filter((id) => Number(id.slice(1)) > 20).map((id) => ({ ...feedPost, id })),
      hasMore: false,
      dbScannedCount: 0,
      pagingOffsetAdvance: 0,
    }));
    const j = await callActive();
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["p21"]);
    expect(listFeed).toHaveBeenCalledTimes(2);
  });

  it("D-11: 동네 탭(locationKey) = 그 동네(locations.id) 글만 위쪽 카드 값 · 다른 탭은 지역 조건 없음", async () => {
    fetchCanonical.mockResolvedValue({ ok: true, truncated: false, items: [{ postId: "post-1", startAt: "x" }] });
    listFeed.mockResolvedValue({ posts: [feedPost], hasMore: false, dbScannedCount: 1, pagingOffsetAdvance: 1 });
    ensureLocation.mockResolvedValue("loc-pasig-1");
    await callActive("boardKey=plife&locationKey=ph-pasig&city=Pasig&district=&name=Kapitolyo");
    expect(ensureLocation).toHaveBeenCalledTimes(1);
    expect(listFeed).toHaveBeenCalledWith(expect.objectContaining({ locationId: "loc-pasig-1", postIds: ["post-1"] }));
    expect(listFeed.mock.calls[0]![0]).not.toHaveProperty("allLocations");

    listFeed.mockClear();
    ensureLocation.mockClear();
    await callActive("boardKey=plife&topic=free");
    expect(ensureLocation).not.toHaveBeenCalled();
    expect(listFeed).toHaveBeenCalledWith(expect.objectContaining({ allLocations: true }));
  });

  it("D-11: 동네를 못 찾으면 위쪽 카드 값 없음(다른 동네 글을 위에 올리지 않는다)", async () => {
    fetchCanonical.mockResolvedValue({ ok: true, truncated: false, items: [{ postId: "post-1", startAt: "x" }] });
    ensureLocation.mockResolvedValue(null);
    const j = await callActive("boardKey=plife&locationKey=unknown");
    expect(listFeed).not.toHaveBeenCalled();
    expect(j.ads).toEqual([{ adId: "post-1", postId: "post-1", feedPost: null }]);
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
