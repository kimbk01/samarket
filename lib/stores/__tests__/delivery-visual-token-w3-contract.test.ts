import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
/** 주석 제외 */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
describe("UI-05 주문·배달 화면 비활성 버튼 (라이트, 스코프 한정)", () => {
  it("주문 화면 스코프에서만 비활성 회색을 한 단계 밝게 (전역 --sam-* 불변)", () => {
    expect(src("app/store-order-list-tokens.css")).toMatch(
      /\[data-store-orders-surface\]\s*\{\s*--sam-primary-disabled:/
    );
    expect(src("app/delivery-tokens.css")).toMatch(
      // 소비자 트리 + 그 트리에서 연 포털(`[data-delivery-scope="consumer"]`, OverlayScopeProvider)
      /\.delivery-ui\[data-delivery-consumer-surface\],\s*\[data-delivery-scope="consumer"\]\s*\{\s*--sam-primary-disabled:/
    );
  });
  it("포털 시트 취소 요청 버튼·상세 페이지가 스코프 속성을 달고 opacity 를 겹치지 않는다", () => {
    const view = src("components/mypage/MyStoreOrderDetailView.tsx");
    expect(view).toContain('import "@/app/store-order-list-tokens.css"');
    expect(view).toContain('data-store-orders-surface="mypage"');
    expect(view).not.toMatch(/disabled:opacity-/);
    expect(src("app/(main)/mypage/store-orders/[orderId]/page.tsx")).toContain('data-store-orders-surface="mypage"');
    expect(src("components/stores/StoreReportForm.tsx")).not.toMatch(/disabled:opacity-/);
    const shell = src("components/delivery/navigation/StoresDeliveryLayoutShell.tsx");
    expect(shell).toContain("const isConsumerSurface = !isStoreOwnerAdminPathname(pathname);");
    expect(shell).toContain('data-delivery-consumer-surface={isConsumerSurface ? "" : undefined}');
  });
});

describe("DIBAY 는 다크 모드 없음 — 배달 토큰에 다크 전용 규칙을 추가하지 않는다", () => {
  it("delivery-tokens.css 에 prefers-color-scheme: dark 블록 없음", () => {
    expect(src("app/delivery-tokens.css")).not.toContain("prefers-color-scheme: dark");
  });
  it("주문 목록 토큰의 기존 다크 블록에 on-primary·표면 재정의를 추가하지 않음", () => {
    const css = src("app/store-order-list-tokens.css");
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(dark).not.toContain("--sam-text-on-primary");
    expect(dark).not.toContain("--sol-card-bg");
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
    /**
     * 묶음3-A C-08 (Owner 승인) — 한 화면에 primary 는 1개: 리뷰 CTA 가 보이면 리뷰가 primary,
     * 주문 상세는 보조 스타일. 리뷰 CTA 가 없으면 주문 상세가 primary. (이전 계약: 둘 다 primary)
     */
    expect(c).toContain('className="delivery-btn-primary mt-6"');
    expect(c).toMatch(/showReviewCta\s*\?\s*"delivery-ui mt-3[^"]*"\s*:\s*"delivery-btn-primary mt-6"/);
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
  /** WP6 (배민형 2차수 2026-10-29) — 메뉴 + = 흰 원 32px + 그림자 + 진한 기호, 초록 테두리 제거 (의도된 계약 변경) */
  it("메뉴 + 버튼은 #00704A 없음 · WP6 흰 원 + 진한 기호 · 테두리 없음", () => {
    expect(src("lib/stores/store-menu-quick-add-button-styles.ts")).not.toMatch(/#00704A/i);
    const tokens = src("app/delivery-tokens.css");
    expect(tokens).toContain("--delivery-menu-plus-size: 32px");
    expect(tokens).toContain("--delivery-menu-plus-fg: var(--sam-fg)");
    expect(tokens).toContain("--delivery-menu-plus-border-width: 0px");
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
