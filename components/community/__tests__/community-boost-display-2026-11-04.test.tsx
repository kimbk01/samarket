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

/** 운영 고정 판정용 `community_posts` 행 — null 이면 `from` 없는 대역(예전 시험과 같음) */
let operatorRows: Record<string, unknown>[] | null = null;
let operatorQueryError = false;
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () =>
    operatorRows == null
      ? {}
      : {
          from: () => ({
            select: () => ({
              in: async (_c: string, ids: string[]) =>
                operatorQueryError
                  ? { data: null, error: { message: "x" } }
                  : { data: operatorRows!.filter((r) => ids.includes(String(r.id))), error: null },
            }),
          }),
        },
}));
vi.mock("@/lib/neighborhood/philife-neighborhood-topics", () => ({
  loadPhilifeDefaultSectionTopics: async () => [],
}));
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
import { planCommunityFeedAdPlacement } from "@/lib/promotion/community-feed-ad-placement";
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
  operatorRows = null;
  operatorQueryError = false;
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

  it("Owner 2026-11-05 지역 제한 해제: 예전 화면이 동네(locationKey)를 보내도 모든 지역 기준 · 응답이 같다", async () => {
    fetchCanonical.mockResolvedValue({ ok: true, truncated: false, items: [{ postId: "post-1", startAt: "x" }] });
    listFeed.mockResolvedValue({ posts: [feedPost], hasMore: false, dbScannedCount: 1, pagingOffsetAdvance: 1 });
    const pasig = await callActive("boardKey=plife&locationKey=ph-pasig&city=Pasig&district=&name=Kapitolyo");
    const unknown = await callActive("boardKey=plife&locationKey=unknown");
    const global = await callActive("boardKey=plife");
    expect(ensureLocation).not.toHaveBeenCalled();
    for (const call of listFeed.mock.calls) {
      expect(call[0]).toMatchObject({ allLocations: true, postIds: ["post-1"] });
      expect(call[0]).not.toHaveProperty("locationId");
    }
    expect(pasig).toEqual(global);
    expect(unknown).toEqual(global);
    expect(global.ads[0]!.feedPost).toMatchObject({ id: "post-1" });
  });
});

describe("Owner 2026-11-05 빈자리 — 운영 고정 글이 광고 1순위면 다음 유효 광고가 위쪽 1건", () => {
  const PAST = "2026-01-01T00:00:00Z";
  const pinRow = (id: string, scope: "feed" | "topic", topicSlug = "free") => ({
    id,
    topic_slug: topicSlug,
    pinned_at: PAST,
    pinned_until: null,
    pin_scope: scope,
    is_notice: false,
  });
  const ads3 = () => {
    fetchCanonical.mockResolvedValue({
      ok: true,
      truncated: false,
      items: ["op", "a2", "a3"].map((postId) => ({ postId, startAt: "x" })),
    });
    listFeed.mockImplementation(async (o: { postIds: string[] }) => ({
      posts: o.postIds.map((id) => ({ ...feedPost, id })),
      hasMore: false,
      dbScannedCount: 0,
      pagingOffsetAdvance: 0,
    }));
  };
  const post = (id: string, over: Record<string, unknown> = {}) =>
    ({ ...feedPost, id, ...over }) as unknown as NeighborhoodFeedPostDTO;

  it("전체 탭: 전체 고정 글(op) 다음 광고 a2 까지 카드 값 → 화면은 op 를 운영 고정 자리에, a2 를 위쪽 광고 1건으로", async () => {
    ads3();
    operatorRows = [pinRow("op", "feed")];
    const j = await callActive();
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["op", "a2"]);

    const topAds = j.ads as unknown as Array<{ postId: string; feedPost: NeighborhoodFeedPostDTO | null }>;
    const posts = [post("op", { is_pinned: true }), post("n1"), post("a3"), post("n2")];
    const r = planCommunityFeedAdPlacement({ posts, topAds });
    expect(r.operatorTopPosts.map((p) => p.id)).toEqual(["op"]);
    expect(r.topAdsBelowOperator.map((a) => a.postId)).toEqual(["a2"]);
    expect(r.postsForList.map((p) => p.id)).toEqual(["n1", "a3", "n2"]); // 일반 글 누락·중복 없음
    expect(r.activeAdPostIds.has("op")).toBe(true);
    expect(r.activeAdPostIds.has("a3")).toBe(true);
  });

  it("주제 탭: 피드와 같은 판정 — 주제 고정(scope=topic·같은 주제)만 운영 고정, 전체 고정(scope=feed)은 아님", async () => {
    ads3();
    operatorRows = [pinRow("op", "topic", "free")];
    let j = await callActive("boardKey=plife&topic=free");
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["op", "a2"]);

    operatorRows = [pinRow("op", "feed")];
    j = await callActive("boardKey=plife&topic=free");
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["op"]);

    operatorRows = [pinRow("op", "topic", "other")];
    j = await callActive("boardKey=plife&topic=free");
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["op"]);
  });

  it("다음 유효 광고가 없으면 억지로 채우지 않는다 (위쪽 광고 0건 · 운영 고정 자리는 그대로)", async () => {
    fetchCanonical.mockResolvedValue({ ok: true, truncated: false, items: [{ postId: "op", startAt: "x" }] });
    listFeed.mockResolvedValue({ posts: [{ ...feedPost, id: "op" }], hasMore: false, dbScannedCount: 1, pagingOffsetAdvance: 1 });
    operatorRows = [pinRow("op", "feed")];
    const j = await callActive();
    const topAds = j.ads as unknown as Array<{ postId: string; feedPost: NeighborhoodFeedPostDTO | null }>;
    const r = planCommunityFeedAdPlacement({ posts: [post("op", { is_pinned: true }), post("n1")], topAds });
    expect(r.operatorTopPosts.map((p) => p.id)).toEqual(["op"]);
    expect(r.topAdsBelowOperator).toEqual([]);
    expect(r.postsForList.map((p) => p.id)).toEqual(["n1"]);
  });

  it("운영 고정 칸이 없는 화면(이웃만·해시태그 — 피드가 상단을 안 올림)에서는 결제 순서대로 op 가 위쪽 1건", async () => {
    ads3();
    operatorRows = [pinRow("op", "feed")];
    const j = await callActive();
    const topAds = j.ads as unknown as Array<{ postId: string; feedPost: NeighborhoodFeedPostDTO | null }>;
    const r = planCommunityFeedAdPlacement({ posts: [post("n1"), post("a2")], topAds });
    expect(r.topAdsBelowOperator.map((a) => a.postId)).toEqual(["op"]);
    expect(r.postsForList.map((p) => p.id)).toEqual(["n1", "a2"]);
  });

  it("운영 고정 판정 조회가 실패하면 예전 동작(앞 1건만 카드 값)", async () => {
    ads3();
    operatorRows = [pinRow("op", "feed")];
    operatorQueryError = true;
    const j = await callActive();
    expect(j.ads.filter((a) => a.feedPost != null).map((a) => a.postId)).toEqual(["op"]);
  });
});

describe("Owner 2026-11-05 같은 글 중복 금지 — 다음 페이지·광고 종료", () => {
  const post = (id: string, over: Record<string, unknown> = {}) =>
    ({ ...feedPost, id, ...over }) as unknown as NeighborhoodFeedPostDTO;
  const ad = (id: string, withCard: boolean) => ({ postId: id, feedPost: withCard ? post(id) : null });

  it("위쪽 광고 글이 다음 페이지 일반 목록에 와도 한 번만(위쪽 자리) · 나머지 광고 글은 일반 자리 한 번", () => {
    const page1 = [post("n1"), post("n2")];
    const page2 = [post("a1"), post("n3"), post("a2")];
    const r = planCommunityFeedAdPlacement({ posts: [...page1, ...page2], topAds: [ad("a1", true), ad("a2", false)] });
    const shown = [...r.operatorTopPosts.map((p) => p.id), ...r.topAdsBelowOperator.map((a) => a.postId), ...r.postsForList.map((p) => p.id)];
    expect(shown).toEqual(["a1", "n1", "n2", "n3", "a2"]);
    expect(new Set(shown).size).toBe(shown.length);
    expect(r.activeAdPostIds.has("a2")).toBe(true);
  });

  it("광고가 끝나면 위쪽 자리가 비고 그 글은 일반 자리 한 번만", () => {
    const r = planCommunityFeedAdPlacement({ posts: [post("n1"), post("a1"), post("n2")], topAds: [] });
    expect(r.topAdsBelowOperator).toEqual([]);
    expect(r.postsForList.map((p) => p.id)).toEqual(["n1", "a1", "n2"]);
  });

  it("화면은 광고 요청에 동네·지역 값을 싣지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/community/CommunityFeed.tsx", "utf8");
    const fetchLine = src.split("\n").find((l) => l.includes("/api/ads/active?boardKey=plife")) ?? "";
    expect(fetchLine).not.toBe("");
    expect(fetchLine).not.toMatch(/locationKey|city|district/);
    expect(src).not.toContain("adsLocalQuery");
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
