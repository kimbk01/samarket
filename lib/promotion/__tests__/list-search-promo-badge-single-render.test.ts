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

  it("search list uses ProductCard only", () => {
    const text = src("components/search/SearchResultList.tsx");
    expect(text).toContain("ProductCard");
    expect(text).not.toContain("PostCard");
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

  it("DETAIL seller CTA is Product A sheet, not trade-ads/apply", () => {
    const detail = src("components/post/PostDetailView.tsx");
    const sheet = src("components/post/MemberPostPromoteSheet.tsx");
    expect(detail).toContain("MemberPostPromoteSheet");
    expect(detail).toContain("trade_promo_detail_cta");
    expect(detail).not.toContain("trade-ads/apply");
    expect(detail).not.toContain("TradePostAdApplySheet");
    expect(sheet).toContain("/api/me/points/promotion-orders");
    expect(sheet).not.toContain("trade-ads/apply");
    expect(sheet).toContain("promo_sheet_title_trade");
  });

  it("admin ad-applications mounts trade and community promotion queues", () => {
    // Owner Policy LOCK: legacy /admin/ad-applications → boosts / applications authority
    const route = src("app/admin/ad-applications/page.tsx");
    expect(route).toContain("redirect");
    expect(route).toContain("/admin/advertising/boosts");
    expect(route).toContain("/admin/advertising/applications");
    expect(route).not.toContain('domain="trade"');
    expect(route).not.toContain('domain="community"');
    // Queue component KEEP (mounted from advertising workspace / legacy page module)
    const page = src("components/admin/ads/AdminAdApplicationsPage.tsx");
    expect(page).toContain("<AdminCommunityPromotionQueue domain=\"trade\" />");
    expect(page).toContain("<AdminCommunityPromotionQueue domain=\"community\" />");
    expect(page).toContain("AdminFeedAdRequestQueue");
    const api = src("app/api/admin/trade-promotion-orders/[id]/route.ts");
    expect(api).toContain("requireAdminApiUser");
    expect(api).toContain("export async function GET");
    expect(api).toContain("approveTradePaidExposure");
    expect(api).toContain("rejectTradePaidExposure");
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
