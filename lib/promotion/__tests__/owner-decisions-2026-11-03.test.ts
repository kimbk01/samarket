/**
 * Owner 결정 2026-11-03 「권장안대로」 — docs/audit/ads-owner-decisions-2026-11-03.md
 * 웹: O-1 커뮤니티 「광고」 표기 · O-2 커뮤니티 위쪽 3개 · O-3 상세 「광고」 · O-5 공통 화면 바로가기 카드 · O-6① 도메인 메뉴 신청 처리
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

describe("O-1 커뮤니티 상위노출 표기 = 「광고」", () => {
  it("카드 칩·글쓴이 메뉴·결제 창 안내", () => {
    expect(ko("community_top_fix_badge")).toBe("광고");
    expect(ko("community_my_post_ads")).toBe("내 글 상위노출");
    expect(ko("promo_sheet_not_top_pin")).not.toContain("상단 고정");
    expect(read("components/ads/AdPostCard.tsx")).not.toContain("never 「광고」");
  });
});

describe("O-2 커뮤니티 위쪽 3개 — 거래와 같은 값", () => {
  it("한 값을 같이 쓴다", () => {
    expect(PROMOTED_TOP_PINS_MAX).toBe(3);
    expect(MAX_PAGE0_PROMOTED_PINS).toBe(PROMOTED_TOP_PINS_MAX);
  });
  it("위쪽은 3개만, 나머지 광고 중인 글은 일반 자리에 「광고」", () => {
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain(".slice(0, PROMOTED_TOP_PINS_MAX)");
    expect(feed).toContain("isAd={activeAdPostIds.has(String(p.id))}");
    expect(feed).toContain("!pinnedAdPostIds.has(String(p.id))");
    expect(read("components/community/feed-list-layouts.tsx")).toContain("{vm.isAd ? <CommunityAdBadge /> : null}");
    expect(read("components/community/CommunityCard.tsx")).toContain("prev.isAd === next.isAd");
  });
});

describe("O-3 상세 화면 「광고」", () => {
  it("거래 상세: 판매자 프로필과 동시에 광고 중 여부를 읽어 meta 로 표시", () => {
    const svc = read("services/trade/trade-detail.service.ts");
    expect(svc).toMatch(/Promise\.all\(\[\s*loadSellerPublicProfile\(clients, sellerId\),\s*isPostEligibleForPromotionBoost/);
    expect(svc).toContain("promotion_projection: TRADE_PROMOTION_PROJECTION");
    expect(read("components/post/PostDetailView.tsx")).toContain("postHasTradePromotionOverlay(post) ? (");
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
      ["delivery-store-promo-requests", "/admin/advertising/applications?family=sponsored"],
      ["delivery-owner-popup-requests", "/admin/advertising/applications?family=popup"],
      ["trade-member-banner-requests", "/admin/advertising/applications?family=banner"],
      ["community-member-banner-requests", "/admin/advertising/applications?family=banner"],
      ["community-boost-prices", "/admin/trade-ad-policies"],
    ];
    for (const [key, path] of want) {
      const node = findAdminMenuByKey(adminMenu, key);
      expect(node?.path, key).toBe(path);
      expect(node?.entryAlias, key).toBe(true);
    }
  });
});
