import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MY_STICKY_CTA_ABOVE_BOTTOM_NAV_CSS,
  MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS,
  MY_STICKY_CTA_BODY_CLEARANCE_WITH_NAV_CLASS,
  resolveMyStickyCtaBodyClearanceClass,
  resolveMyStickyCtaPlacement,
} from "@/lib/mypage/my-sticky-cta-placement";
import { isMypageSubpageHeaderPath } from "@/lib/mypage/mypage-subpage-header-defaults";
import {
  MYPAGE_BODY_COLUMN_CLASS,
  MYPAGE_GUTTER_X_CLASS,
  MYPAGE_SCROLL_BODY_CLASS,
} from "@/lib/ui/mypage-responsive-breakpoints";
import { CUSTOMER_CENTER_SCROLL_BODY_CLASS } from "@/lib/mypage/customer-center-layout";
import { resolveAddressManageScrollInnerClass } from "@/lib/addresses/mypage-address-manage-layout";
import {
  STORE_ORDER_REVIEW_SCROLL_INNER_CLASS,
  resolveStoreOrderReviewScrollInnerClass,
} from "@/lib/stores/store-order-review-page-layout";

const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("mypage body column — 16/20px · 640px, gutter once (v3 §2)", () => {
  it("column = max 40rem + px-4 md:px-5; scroll wrapper has no horizontal padding", () => {
    expect(MYPAGE_BODY_COLUMN_CLASS).toContain("max-w-[40rem]");
    expect(MYPAGE_BODY_COLUMN_CLASS).toContain(MYPAGE_GUTTER_X_CLASS);
    expect(MYPAGE_BODY_COLUMN_CLASS).toContain("mx-auto");
    expect(MYPAGE_SCROLL_BODY_CLASS).not.toMatch(/\bp[xlr]-/);
    expect(CUSTOMER_CENTER_SCROLL_BODY_CLASS).toBe(MYPAGE_SCROLL_BODY_CLASS);
  });

  it("MyScreen applies the gutter once (no app feed gutter around it)", () => {
    const screen = src("components/mypage/ds/MyScreen.tsx");
    expect(screen).not.toContain("APP_MAIN_TAB_SCROLL_BODY_CLASS");
    expect(screen).toContain("MYPAGE_SCROLL_BODY_CLASS");
    expect(screen).toContain("MYPAGE_BODY_COLUMN_CLASS");
  });

  it("hand-assembled mypage screens no longer stack the feed gutter under the mypage column", () => {
    const files = [
      "app/(main)/mypage/benefits/page.tsx",
      "app/(main)/mypage/order-notifications/page.tsx",
      "app/(main)/mypage/store-orders/[orderId]/page.tsx",
      "app/(main)/mypage/trade/layout.tsx",
      "components/mypage/community/MypageCommunityPostsChrome.tsx",
      "components/mypage/community-activity/MypageCommunityActivityChrome.tsx",
      "components/recent-viewed/RecentViewedList.tsx",
      "components/mypage/mobile/MyPageStackShell.tsx",
      "components/mypage/products/MyProductsPageClient.tsx",
      "components/gift-certificate/OwnedGiftInstanceDetailView.tsx",
    ];
    for (const f of files) {
      const code = src(f);
      expect(code, f).not.toContain("APP_MAIN_TAB_SCROLL_BODY_CLASS");
      expect(code, f).not.toContain("APP_MAIN_FEED_STACK_CLASS");
      expect(code, f).toMatch(/MYPAGE_BODY_COLUMN_CLASS|MYPAGE_SCROLL_BODY_CLASS/);
    }
    expect(src("app/(main)/mypage/ads/feed-request/page.tsx")).not.toContain("max-w-lg");
  });

  it("shared layouts branch by mypage route only (delivery/onboarding unchanged)", () => {
    expect(resolveAddressManageScrollInnerClass("/mypage/addresses", false)).toContain("max-w-[40rem]");
    expect(resolveAddressManageScrollInnerClass("/mypage/addresses/search", false)).toContain(MYPAGE_GUTTER_X_CLASS);
    expect(resolveAddressManageScrollInnerClass("/onboarding/address", true)).not.toContain("max-w-[40rem]");
    expect(resolveStoreOrderReviewScrollInnerClass(true)).toBe(STORE_ORDER_REVIEW_SCROLL_INNER_CLASS);
    expect(resolveStoreOrderReviewScrollInnerClass(false)).toContain("max-w-[40rem]");
    const hub = src("components/orders/customer-commerce/CustomerCommerceHubBody.tsx");
    expect(hub).toContain("isMypageSubpageHeaderPath(pathname) ? MYPAGE_COMMERCE_HUB_BODY_CLASS : APP_MAIN_TAB_SCROLL_BODY_CLASS");
  });
});

describe("MyStickyCta placement (v3 §12 bottom CTA)", () => {
  it("sits directly above the bottom tab bar when it is mounted", () => {
    const p = resolveMyStickyCtaPlacement({ bottomNavOccupies: true, keyboardOpen: false, effectiveBottomInset: 34 });
    expect(p.aboveBottomNav).toBe(true);
    expect(p.bottom).toBe(MY_STICKY_CTA_ABOVE_BOTTOM_NAV_CSS);
    expect(p.bottom).toContain("--app-bottom-nav-height");
    expect(p.paddingBottom).toBe("0px");
  });

  it("without tab bar: bottom 0 and paints the bottom safe area", () => {
    const p = resolveMyStickyCtaPlacement({ bottomNavOccupies: false, keyboardOpen: false, effectiveBottomInset: 34 });
    expect(p.aboveBottomNav).toBe(false);
    expect(p.bottom).toBe("0px");
    expect(p.paddingBottom).toBe("max(var(--safe-bottom, 0px), 34px)");
  });

  it("keyboard open or tab scroll-hidden → above keyboard / bottom", () => {
    const kb = resolveMyStickyCtaPlacement({ bottomNavOccupies: true, keyboardOpen: true, effectiveBottomInset: 300 });
    expect(kb.aboveBottomNav).toBe(false);
    expect(kb.paddingBottom).toBe("300px");
    const hidden = resolveMyStickyCtaPlacement({
      bottomNavOccupies: true,
      bottomNavHidden: true,
      keyboardOpen: false,
      effectiveBottomInset: 0,
    });
    expect(hidden.aboveBottomNav).toBe(false);
  });

  it("body clearance = tab + CTA + safe (shell owns tab+safe on tab routes)", () => {
    expect(resolveMyStickyCtaBodyClearanceClass(false)).toBe(MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS);
    expect(MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS).toContain("--safe-bottom");
    expect(resolveMyStickyCtaBodyClearanceClass(true)).toBe(MY_STICKY_CTA_BODY_CLEARANCE_WITH_NAV_CLASS);
    expect(MY_STICKY_CTA_BODY_CLEARANCE_WITH_NAV_CLASS).toContain("46px");
  });

  it("disabled uses token grey, not opacity", () => {
    const cta = src("components/mypage/ds/MyStickyCta.tsx");
    expect(cta).not.toContain("disabled:opacity-45");
    expect(cta).toContain("Sam.btn.disabledToken");
    expect(cta).toContain("useBottomNavOccupiesClearance");
  });
});

describe("mypage subpage header default — bell on the right (max 1 icon)", () => {
  it("applies on /mypage/* only", () => {
    expect(isMypageSubpageHeaderPath("/mypage/benefits")).toBe(true);
    expect(isMypageSubpageHeaderPath("/mypage/points/charge?x=1")).toBe(true);
    expect(isMypageSubpageHeaderPath("/mypage")).toBe(false);
    expect(isMypageSubpageHeaderPath("/notifications")).toBe(false);
    expect(isMypageSubpageHeaderPath(null)).toBe(false);
  });

  it("MySubpageHeader defaults showHubQuickActions from the route", () => {
    const header = src("components/my/MySubpageHeader.tsx");
    expect(header).toContain("showHubQuickActionsProp ?? isMypageSubpageHeaderPath(pathname)");
  });
});
