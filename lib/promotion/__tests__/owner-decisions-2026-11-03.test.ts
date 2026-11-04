/**
 * Owner 결정 2026-11-03 「권장안대로」 — docs/audit/ads-owner-decisions-2026-11-03.md
 * 웹: O-1 커뮤니티 「광고」 표기 · O-2 커뮤니티 위쪽 개수(2026-11-05 1개) · O-3 상세 「광고」 · O-5 공통 화면 바로가기 카드 · O-6① 도메인 메뉴 신청 처리
 * DB (「DB 3건 진행」): O-10 환급 원장 문구 · O-6② 공통 화면 도메인 거름 · O-4 피드 배너 노출·클릭 기록
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { PROMOTED_TOP_PINS_MAX } from "@/lib/promotion/promoted-top-pins";
import { MAX_PAGE0_PROMOTED_PINS } from "@/lib/promotion/feed-promotion-projection";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ko = (k: string) => translate("ko", k as MessageKey);

describe("O-1 커뮤니티 상위노출 표기 = 「포인트 노출」 (Owner 2026-11-04 「배경 + 글자」 · 옛 「광고」 대체)", () => {
  it("카드 칩·글쓴이 메뉴·결제 창 안내", () => {
    expect(ko("community_top_fix_badge")).toBe("포인트 노출");
    expect(ko("community_my_post_ads")).toBe("내 글 상위노출");
    expect(ko("promo_sheet_not_top_pin")).not.toContain("상단 고정");
  });
});

describe("O-2 커뮤니티 위쪽 개수 — 거래와 같은 값 (Owner 2026-11-05 「상위노출 1건」)", () => {
  it("한 값을 같이 쓴다", () => {
    expect(PROMOTED_TOP_PINS_MAX).toBe(1);
    expect(MAX_PAGE0_PROMOTED_PINS).toBe(PROMOTED_TOP_PINS_MAX);
  });
  it("위쪽은 1개만, 나머지 광고 중인 글은 일반 자리에 「광고」", () => {
    // 광고 ② PB-21·PB-22 (2026-11-04): 자리 계산은 `planCommunityFeedAdPlacement` 하나 (동작 시험은 ads-impl-1104-community-card-feed)
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain("planCommunityFeedAdPlacement({ posts, topAds })");
    expect(feed).toContain("isAd={activeAdPostIds.has(String(p.id))}");
    const plan = read("lib/promotion/community-feed-ad-placement.ts");
    expect(plan).toContain(".slice(0, topMax)");
    expect(plan).toContain("!pinnedAdPostIds.has(String(p.id))");
    expect(read("components/community/feed-list-layouts.tsx")).toContain("{vm.isAd ? <CommunityAdBadge /> : null}");
    expect(read("components/community/CommunityCard.tsx")).toContain("prev.isAd === next.isAd");
  });
});

describe("B-D2 (Owner 2026-11-05) — 고정 글이 뒤 페이지 일반 목록으로 다시 붙지 않는다", () => {
  it("거래 홈·카테고리 목록은 붙일 때 이미 본 id 를 거른다", () => {
    expect(read("components/home/HomeProductList.tsx")).toMatch(
      /const seen = new Set\(prev\.map\(\(p\) => p\.id\)\);\s*const appended = res\.posts\.filter\(\(p\) => \{\s*const id = p\.id\?\.trim\(\);\s*return id && !seen\.has\(id\);/
    );
    expect(read("components/post/PostListByCategory.tsx")).toContain(
      "return [...prev, ...next.posts.filter((p) => p.id && !seen.has(p.id))];"
    );
  });
});

describe("O-3 상세 화면 「광고」", () => {
  it("거래 상세: 판매자 프로필과 동시에 광고 중 여부를 읽어 meta 로 표시", () => {
    const svc = read("services/trade/trade-detail.service.ts");
    expect(svc).toMatch(/Promise\.all\(\[\s*loadSellerPublicProfile\(clients, sellerId\),\s*isPostEligibleForPromotionBoost/);
    expect(svc).toContain("promotion_projection: TRADE_PROMOTION_PROJECTION");
    /** F-F (2026-11-04): 광고 표시 + 지금 상위노출 대상(판매완료·숨김 제외)일 때만 */
    expect(read("components/post/PostDetailView.tsx")).toContain(
      "postHasTradePromotionOverlay(post) && isPostEligibleForPromotionBoost(post.status, post.seller_listing_state) ? ("
    );
  });
  it("커뮤니티 상세: 모임 조회와 동시에 읽어 말머리 줄에 표시", () => {
    expect(read("app/(main)/philife/[postId]/page.tsx")).toContain('isPromotionLiveForTarget(promoSb, { targetType: "community_post", targetId: seg })');
    expect(read("components/community/post-detail/CommunityPostCategoryRow.tsx")).toContain("{isAd ? <CommunityAdBadge /> : null}");
  });
  it("노출 조건 = 목록과 같음 (active · 기간 안)", () => {
    const f = read("lib/promotion/promotion-live-target.ts");
    expect(f).toContain('.eq("order_status", "active")');
    expect(f).toContain('.lte("start_at", nowIso)');
    expect(f).toContain('.gte("end_at", nowIso)');
  });
});

describe("O-5 · O-6① 어드민", () => {
  it("O-5: 「전체 광고」 위 바로가기 카드 4개 (읽기 전용 요약)", () => {
    const ws = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(ws).toContain('{mode === "all" ? <AdminAdsOtherSurfacesCards ko={ko} /> : null}');
    const cards = read("components/admin/ads/AdminAdsOtherSurfacesCards.tsx");
    for (const href of ["/admin/platform-promotion/intro", "/admin/ptr-reveal-ads", "/admin/my/banners", "/admin/platform-events"]) {
      expect(cards).toContain(href);
    }
    expect(read("app/api/admin/advertising/other-surfaces/route.ts")).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
  it("O-6①: 도메인 메뉴 신청 처리 바로가기 (같은 경로 별칭)", () => {
    const want: Array<[string, string]> = [
      ["delivery-store-promo-requests", "/admin/advertising/applications?family=sponsored&domain=delivery"],
      ["delivery-owner-popup-requests", "/admin/advertising?family=popup&domain=delivery"],
      ["trade-member-banner-requests", "/admin/advertising/applications?family=banner&domain=trade"],
      ["community-member-banner-requests", "/admin/advertising/applications?family=banner&domain=community"],
      ["community-boost-prices", "/admin/trade-ad-policies"],
    ];
    for (const [key, path] of want) {
      const node = findAdminMenuByKey(adminMenu, key);
      expect(node?.path, key).toBe(path);
      expect(node?.entryAlias, key).toBe(true);
    }
  });
});

describe("DB 3건 — O-10 · O-6② · O-4", () => {
  const mig = (f: string) => read(`supabase/migrations/${f}`);
  it("O-10: 운영 함수 문구 1줄만 (정확히 1번 있을 때만)", () => {
    const sql = mig("20271104020000_ads_owner_decisions_o10_o6_domain.sql");
    expect(sql).toContain("커뮤니티 상위노출 종료 환급 (운영 사유)");
    expect(sql).toContain("바꿀 문구가 정확히 1번 있어야 함");
  });
  it("O-6②: p_domain 기본 null = 전체 · 로더·API·화면이 같은 값을 넘긴다", () => {
    const sql = mig("20271104020000_ads_owner_decisions_o10_o6_domain.sql");
    expect(sql).toContain("p_domain text DEFAULT NULL::text");
    expect(sql).toContain("TO service_role");
    expect(read("lib/admin/ads-control-plane/load-ads-control-plane.ts")).toContain("p_domain: domain,");
    expect(read("app/api/admin/ads-control-plane/route.ts")).toContain('pick("domain", DOMAINS)');
    expect(read("lib/admin/ads-control-plane/fetch-ads-control-plane.ts")).toContain('params.set("domain", page.domain)');
    const ws = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(ws).toContain("domain: domainFilter || undefined,");
    expect(ws).toContain("data-admin-ads-domain-filter-chip={domainFilter}");
    expect(ws).toContain('"전체 보기"');
  });
  it("O-4: 서버가 키를 만들고 새 행일 때만 숫자 +1 · service_role 만", () => {
    const sql = mig("20271104030000_feed_ad_events_o4.sql");
    expect(sql).toContain("dedupe_key text NOT NULL UNIQUE");
    expect(sql).toContain("ON CONFLICT (dedupe_key) DO NOTHING");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_feed_ad_event[^;]+FROM PUBLIC, anon, authenticated/);
    expect(read("app/api/feed-ads/events/route.ts")).toContain('sb.rpc("record_feed_ad_event"');
  });
  it("O-4: 배너 — 50% 이상 1초 노출 · 이동 전 클릭", async () => {
    const ev = await import("@/lib/ads/feed-ad-event-client");
    expect(ev.FEED_AD_IMPRESSION_MIN_RATIO).toBe(0.5);
    expect(ev.FEED_AD_IMPRESSION_DWELL_MS).toBe(1000);
    const cid = "11111111-1111-4111-8111-111111111111";
    const crid = "22222222-2222-4222-8222-222222222222";
    expect(ev.feedAdCreativeIdOfSlide(`camp:${cid}:${crid}`, cid)).toBe(crid);
    expect(ev.feedAdCreativeIdOfSlide(crid, cid)).toBe(crid);
    expect(ev.feedAdCreativeIdOfSlide("slide-0", cid)).toBeNull();
    const car = read("components/ads/FeedAdBannerCarousel.tsx");
    expect(car).toContain('eventType: "impression"');
    expect(car).toMatch(/onNavigate=\{\(ref\) => \{\s*\/\/ O-4 클릭 1회[^\n]*\n\s*sendFeedAdEvent\(\{\s*eventType: "click"/);
    expect(read("components/admin/ads/AdminFeedAdRequestDetail.tsx")).toContain('data-feed-ad-request-counts="1"');
  });
  it("O-4: 실제 쓰는 목록(공통 광고 화면) 행·상세에 노출·클릭 수", async () => {
    const { projectFeedCampaignToActionItem } = await import("@/lib/admin/ads-control-plane/project-family-rows");
    const item = projectFeedCampaignToActionItem({
      id: "11111111-1111-4111-8111-111111111111",
      name: "x",
      domain: "trade",
      placement: "TRADE_HOME",
      targetCategoryId: null,
      targetTopicSlug: null,
      status: "active",
      priority: 100,
      startAt: null,
      endAt: null,
      destinationType: "internal_page",
      destinationId: "",
      destinationUrl: "",
      slides: [],
      impressionCount: 1234,
      clickCount: 5,
    });
    expect(item.performanceLabel).toBe("노출 1,234 · 클릭 5");
    expect(read("lib/ads/feed-ad-campaigns-db.ts").match(/impressionCount: Number\(row\.impression_count \?\? 0\)/g)?.length).toBe(2);
    const ws = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(ws).toContain("data-feed-ad-counts={r.id}");
    expect(ws).toContain("{selectedShell.performanceLabel}");
  });
});
