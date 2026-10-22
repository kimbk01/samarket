import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
/** 주석 제외 */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const darkBlock = (css: string) => {
  const i = css.indexOf("@media (prefers-color-scheme: dark)");
  expect(i).toBeGreaterThan(-1);
  return css.slice(i);
};

describe("UI-01 · UI-05 주문 화면 다크 on-primary·비활성 (스코프 한정)", () => {
  const css = src("app/store-order-list-tokens.css");
  it("다크에서 주문 화면 스코프의 on-primary 를 짙은 잉크로 재정의", () => {
    const dark = darkBlock(css);
    expect(dark).toMatch(/\[data-store-orders-surface\]\s*\{[^}]*--sam-text-on-primary:\s*var\(--sam-bg-ink\)/);
    expect(dark).toMatch(/--sol-on-accent:\s*var\(--sam-bg-ink\)/);
  });
  it("전역 design-tokens.css 다크 블록은 on-primary 를 재정의하지 않는다 (전역 불변)", () => {
    expect(darkBlock(src("app/design-tokens.css"))).not.toContain("--sam-text-on-primary");
  });
  it("포털 시트 취소 요청 버튼·상세 페이지가 스코프 속성을 달고 opacity 를 겹치지 않는다", () => {
    const view = src("components/mypage/MyStoreOrderDetailView.tsx");
    expect(view).toContain('import "@/app/store-order-list-tokens.css"');
    expect(view).toContain('data-store-orders-surface="mypage"');
    expect(view).not.toMatch(/disabled:opacity-/);
    expect(src("app/(main)/mypage/store-orders/[orderId]/page.tsx")).toContain('data-store-orders-surface="mypage"');
    expect(src("components/stores/StoreReportForm.tsx")).not.toMatch(/disabled:opacity-/);
  });
});

describe("UI-08 다크 표면", () => {
  it("배달 허브 다크 블록에 카드·패널 배경 정의", () => {
    const dark = darkBlock(src("app/store-order-list-tokens.css"));
    for (const v of ["--sol-card-bg: #242526", "--sol-page-bg: #18191a", "--sol-panel-card-bg: #242526", "--sol-panel-fg: #e4e6eb"]) {
      expect(dark, v).toContain(v);
    }
  });
  it("소비자 배달 셸만 다크에서 sam 텍스트·표면을 라이트로 고정 (사장님 제외)", () => {
    const dark = darkBlock(src("app/delivery-tokens.css"));
    expect(dark).toContain(".delivery-ui[data-delivery-consumer-surface]");
    for (const v of ["--sam-text-primary: var(--app-text)", "--sam-bg-surface: var(--app-surface)", "--app-text: var(--sm-color-text-main)"]) {
      expect(dark, v).toContain(v);
    }
    const shell = src("components/delivery/navigation/StoresDeliveryLayoutShell.tsx");
    expect(shell).toContain("data-delivery-consumer-surface={isStoreOwnerAdminPathname(pathname) ? undefined : \"\"}");
  });
});

describe("UI-06 프로모 바 글자색 분기", () => {
  it("한 분기에 글자색 유틸 하나", () => {
    const card = src("components/stores/browse/StoreBrowseCategoryRowCard.tsx");
    expect(card).toContain('campaignBenefit ? "bg-signature text-white" : "bg-sam-warning-soft text-sam-fg"');
    expect(card).not.toContain('"text-sam-fg bg-sam-warning-soft"');
  });
});

describe("UI-04 · UI-09 · UI-10 주문 완료 화면", () => {
  const c = code("components/stores/delivery/RestaurantOrderCompleteClient.tsx");
  it("리뷰 작성·주문상세 = 배달 primary CTA (amber 금지)", () => {
    expect(c).not.toMatch(/amber-/);
    expect(c.match(/className=\{?[`"]delivery-btn-primary/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it("주문 상세는 canonical /orders?expand= 로 바로, 주문 내역은 /orders", () => {
    expect(c).not.toContain("`/my/store-orders/${encodeURIComponent(o.id)}`");
    expect(c).not.toContain("`/my/store-orders/${encodeURIComponent(orderId)}`");
    expect(c).toContain("buyerStoreOrderDetailPath(o.id)");
    expect(c).toContain("buyerStoreOrderDetailPath(orderId)");
    expect(c).toContain('href="/orders"');
    expect(c).not.toContain('href="/mypage/store-orders"');
  });
  it("「매장 보기」 = 매장 홈, aria 키를 본문에 쓰지 않음, 주문 내역 라벨 키", () => {
    expect(c).not.toContain("/order/${encodeURIComponent(o.id)}");
    expect(c).not.toContain("store_order_history_panel_open_aria");
    expect(c).not.toContain("store_order_history_drawer_title");
    expect(c).toContain("store_delivery_float_order_history");
    expect(c).toContain("store_order_complete_check_in_orders_hint");
  });
});

describe("UI-09 메뉴 + · 빈 장바구니 CTA = 배달 primary", () => {
  it("메뉴 + 버튼은 #00704A 대신 --delivery-primary", () => {
    expect(src("lib/stores/store-menu-quick-add-button-styles.ts")).not.toMatch(/#00704A/i);
    const tokens = src("app/delivery-tokens.css");
    expect(tokens).toContain("--delivery-menu-plus-fg: var(--delivery-primary)");
    expect(tokens).toContain("--delivery-menu-plus-border: var(--delivery-primary)");
  });
  it.each(["components/stores/StoreCommerceCartPageClient.tsx", "components/stores/StoreGlobalCartEntry.tsx"])(
    "%s: 빈 상태 둘러보기 = delivery-btn-primary",
    (rel) => {
      const s = src(rel);
      expect(s).toContain('className="delivery-btn-primary w-auto min-w-[11.5rem] px-6"');
      expect(s).not.toContain("rounded-full border border-sam-border bg-white px-6");
    }
  );
});

describe("S3-02 배달 공유 스타일 상수 = --delivery-fs-* 토큰", () => {
  it.each([
    "lib/stores/store-commerce-bottom-action-bar.ts",
    "components/stores/store-facebook-feed-tokens.ts",
    "lib/stores/stores-home-ui.ts",
    "lib/stores/store-baemin-cart-ui.ts",
  ])("%s: text-[Npx] 리터럴 0", (rel) => {
    const s = code(rel);
    expect(s).not.toMatch(/\btext-\[\d+(?:\.\d+)?px\]/);
    expect(s).toMatch(/text-\[length:var\(--delivery-fs-[a-z-]+\)\]/);
  });
});

describe("S3-09 브랜드 밖 파랑·청록·보라 제거", () => {
  it.each([
    ["components/stores/cart/baemin/StoreBaeminCartOrderSummaryCard.tsx", /#(?:F0F9FF|0C4A6E|BAE6FD|0EA5E9)/i],
    ["components/stores/StoreProductPublic.tsx", /#2386B1/i],
    ["components/stores/coupon/StoreCouponCustomerCard.tsx", /#3B82F6/i],
    ["components/mypage/BuyerStoreOrderCompletedReviewBlock.tsx", /#123B4A/i],
    ["components/stores/StoreCommerceCartPageClient.tsx", /\b(?:text|bg|border)-sky-\d{2,3}\b/],
    ["components/stores/StoreReviewsSection.tsx", /\b(?:text|bg)-(?:blue|emerald)-\d{2,3}\b/],
    ["components/stores/store-order-detail/store-order-brand.ts", /#6B3DF4|baeminPurple/i],
  ] as const)("%s", (rel, re) => {
    expect(code(rel)).not.toMatch(re);
  });
});
