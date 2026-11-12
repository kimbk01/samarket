import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function promoBadgeCalls(text: string): number {
  return (text.match(/trade_promo_badge/g) ?? []).length;
}

describe("LIST/SEARCH promotion badge single render", () => {
  it("PostCard paints 홍보 from overlay helper once and does not also read hasPromotionOverlay", () => {
    const text = src("components/post/PostCard.tsx");
    expect(text).toContain("postHasTradePromotionOverlay");
    expect(promoBadgeCalls(text)).toBe(1);
    expect(text).not.toContain("hasPromotionOverlay");
  });

  it("ProductCard paints 홍보 from hasPromotionOverlay once and does not also read promotion_projection", () => {
    const text = src("components/product/ProductCard.tsx");
    expect(text).toContain("hasPromotionOverlay");
    expect(promoBadgeCalls(text)).toBe(1);
    expect(text).not.toContain("promotion_projection");
    expect(text).not.toContain("postHasTradePromotionOverlay");
  });
});

describe("Owner 2026-11-05 카드 광고 상태 표시 1개 — 「광고」만, 「광고 중」 없음", () => {
  it("거래 목록·검색 카드는 판매자 본인이어도 「광고 중」을 그리지 않고, 「광고하기」 버튼(시트 열기)은 남는다", () => {
    for (const rel of ["components/post/PostCard.tsx", "components/product/ProductCard.tsx"]) {
      const text = src(rel);
      expect(text).not.toContain("trade_ad_running_chip");
      expect(text).toContain('t("trade_ad_cta")');
      expect(text).toContain("TradeAdQuickSheet");
      expect(promoBadgeCalls(text)).toBe(1);
    }
    expect(src("components/post/PostCard.tsx")).not.toContain('data-trade-card-ad-entry={isPromotedContent');
  });

  it("「광고 중」은 판매자 광고 관리 화면(내 상품 관리)에만 남는다", () => {
    expect(src("components/mypage/products/MyProductCard.tsx")).toContain("trade_ad_running_chip");
  });
});

describe("CUT F seller promotion unification", () => {
  it("SEARCH path disables pin so CUT C rank is not prepended", () => {
    const route = src("lib/posts/home-posts-route-core.ts");
    const projection = src("lib/promotion/feed-promotion-projection.ts");
    expect(route).toContain("pinPromoted: !q");
    expect(route).toContain('promotionSurface: hasRootSelection ? "category" : "home"');
    expect(route).toContain("tradePromotionPageIndexFromRequestPage(page)");
    expect(projection).toContain("overlayTradePromotionBadges");
    expect(projection).toContain("eq(\"domain\", \"trade\")");
    expect(projection).toContain("pinPromoted === false");
    const overlayStart = projection.indexOf("export function overlayTradePromotionBadges");
    const overlayEnd = projection.indexOf("export async function applyTradeHomePromotionProjection");
    const overlayBody = projection.slice(overlayStart, overlayEnd);
    expect(overlayBody).toContain("annotatePromotedPosts");
    expect(overlayBody).not.toContain("projectTradeFeedWithPromotions");
    expect(overlayBody).not.toContain(".sort(");
    expect(overlayBody).not.toContain("pinned");
  });

  it("LIST browse seed still pins (0-based pageIndex, default pinPromoted)", () => {
    const text = src("lib/posts/home-posts-route-core.ts");
    expect(text).toContain("tradePromotionPageIndexFromRequestPage(page)");
    const seedFn = text.slice(
      text.indexOf("export async function resolveDefaultTradeHomePostsSeedForServerComponent"),
      text.indexOf("export async function resolveHomePostsGetData")
    );
    expect(seedFn).toContain("applyTradeHomePromotionProjection");
    expect(seedFn).toContain("tradePromotionPageIndexFromRequestPage");
    expect(seedFn).toContain('promotionSurface: "home"');
    expect(seedFn).not.toContain("pinPromoted:");
  });

  it("DETAIL seller CTA = 광고하기 창(시안 v3, Product A 결제 API), not trade-ads/apply", () => {
    const detail = src("components/post/PostDetailView.tsx");
    const sheet = src("components/trade/seller-ad/TradeAdQuickSheet.tsx");
    expect(detail).toContain("TradeAdQuickSheet");
    expect(detail).toContain("trade_ad_cta");
    expect(detail).not.toContain("trade-ads/apply");
    expect(detail).not.toContain("TradePostAdApplySheet");
    expect(sheet).toContain("/api/me/points/promotion-orders");
    expect(sheet).not.toContain("trade-ads/apply");
  });

  it("admin ad-applications mounts trade and community promotion queues", () => {
    // Owner Policy LOCK: legacy /admin/ad-applications → boosts / applications authority
    const route = src("app/admin/ad-applications/page.tsx");
    expect(route).toContain("redirect");
    expect(route).toContain("/admin/advertising/boosts");
    expect(route).toContain("/admin/advertising/applications");
    expect(route).not.toContain('domain="trade"');
    expect(route).not.toContain('domain="community"');
    const api = src("app/api/admin/trade-promotion-orders/[id]/route.ts");
    // 거래 Admin 설계 v2 O-2 · §F-4: 거래 게이트 + 승인·반려·중지·재개·종료는 DB 함수(runTradePromotionAction)로.
    expect(api).toContain("requireTradeAdmin");
    expect(api).toContain("export async function GET");
    expect(api).toContain("runTradePromotionAction");
  });

  it("does not drop CUT B sell-intent or CUT C search expansion on the home-posts path", () => {
    const route = src("lib/posts/home-posts-route-core.ts");
    expect(route).toContain("shouldApplyMixedDiscoverySellIntent");
    expect(route).toContain("shouldApplyMarketplaceSearchExpansion");
    expect(route).toContain("resolveMarketplaceMembershipIdsForRoots");
    expect(route).toContain("tradeCategoryIds = tradeCategoryIdsForQuery");
    expect(route).toContain("same membership/HOME-union set");
  });
});
