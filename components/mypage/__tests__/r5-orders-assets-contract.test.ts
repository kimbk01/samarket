import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 주석 제외 — 문구에 든 예시 hex 는 판정 대상 아님 */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const HEX = /#[0-9A-Fa-f]{3,8}\b/;
const PALETTE = /\b(?:text|bg|border|ring|divide)-(?:red|amber|blue|sky|emerald|violet|rose|indigo)-\d{2,3}\b/;

describe("S30·S31 하드코딩 색 제거 — 토큰만 (X19·C5)", () => {
  const files = [
    "components/mypage/MyStoreOrdersView.tsx",
    "components/mypage/MyStoreOrderExpandPanel.tsx",
    "components/mypage/MyStoreOrderDetailView.tsx",
  ];
  it.each(files)("%s: hex 0 · 팔레트 0", (rel) => {
    const c = code(rel);
    expect(c).not.toMatch(HEX);
    expect(c).not.toMatch(PALETTE);
  });

  it("배달 허브 토큰은 기존 하드코딩과 같은 값(시각 불변)", () => {
    const css = src("app/store-order-list-tokens.css").toLowerCase();
    const hub = css.slice(css.indexOf('[data-store-orders-surface="delivery-hub"] {'));
    for (const v of [
      "--sol-fg: #050505",
      "--sol-muted: #65676b",
      "--sol-disabled: #bcc0c4",
      "--sol-separator: #ced0d4",
      "--sol-row-hover: #f6fafc",
      "--sol-thumb-bg: #e4e6eb",
      "--sol-card-bg: #ffffff",
      "--sol-card-border: #dde5e0",
      "--sol-page-bg: #f6f6f6",
      "--sol-info-bg: #e7f3ff",
      "--sol-info-fg: #1877f2",
      "--sol-danger: #f02849",
      "--sol-empty-fg: #6b7280",
      "--sol-panel-bg: #f6fafc",
      "--sol-panel-border: #dde5e0",
      "--sol-panel-fg: #123b4a",
      "--sol-panel-muted: #6b7280",
      "--sol-panel-line: #eef2f0",
      "--sol-panel-line-bg: #fafcfb",
      // Tailwind v4 팔레트 값 그대로(emerald-50/900, amber-800, red-600 …)
      "--sol-pickup-bg: oklch(97.9% 0.021 166.113)",
      "--sol-pickup-fg: oklch(37.8% 0.077 168.94)",
      "--sol-note-fg: oklch(47.3% 0.137 46.201)",
      "--sol-panel-danger: oklch(57.7% 0.245 27.325)",
    ]) {
      expect(hub, v).toContain(v);
    }
    // 다크(기존 dark: 변형)
    for (const v of ["--sol-fg: #e4e6eb", "--sol-muted: #b0b3b8", "--sol-divider: #3e4042", "--sol-action-hover: #3a3b3c"]) {
      expect(hub, v).toContain(v);
    }
    const view = src("components/mypage/MyStoreOrdersView.tsx");
    expect(view).toContain('data-store-orders-surface={isDeliveryHub ? "delivery-hub" : "mypage"}');
    expect(view).toContain('import "@/app/store-order-list-tokens.css"');
  });
});

describe("S30·S31·S34 오류 코드 노출 금지", () => {
  it.each([
    "components/mypage/MyStoreOrdersView.tsx",
    "components/mypage/MyStoreOrderExpandPanel.tsx",
    "components/mypage/MyStoreOrderDetailView.tsx",
    "components/mypage/MyStoreInquiriesView.tsx",
  ])("%s", (rel) => {
    const c = code(rel);
    expect(c).not.toContain("({state.message})");
    expect(c).not.toContain("mypage_comp_error_wrapped");
    expect(c).not.toContain("mypage_comp_cancel_failed_code");
    expect(c).not.toContain("mypage_comp_request_failed_code");
    expect(c).not.toContain("mypage_comp_orders_hide_failed\"");
  });
});

describe("S30 목록 — ?tab= · 공통 확인 시트 · 공통 토스트", () => {
  const view = code("components/mypage/MyStoreOrdersView.tsx");
  it("탭 URL 유지, 숨기기 = ⋯ 액션 시트 → 확인 시트, dibayConfirm 제거", () => {
    expect(view).toContain("useMypageTabParam<MemberOrderTab>");
    expect(view).toContain("DibayActionSheet");
    expect(view).toContain("MobileConfirmBottomSheet");
    expect(view).not.toContain("dibayConfirm(");
    expect(view).toContain("showMypageToast(");
    expect(view).toContain("invalidateMypageSummary()");
    expect(view).toContain("MyListPager");
  });
});

describe("S31 상세 — 하단 고정 CTA · 즉시 취소 확인 · 사유 시트", () => {
  const view = code("components/mypage/MyStoreOrderDetailView.tsx");
  it("고정 CTA + 확인 시트 + 사유 시트, 하단 텍스트 링크 제거", () => {
    expect(view).toContain("<MyStickyCta");
    expect(view).toContain("onPress: () => setCancelConfirmOpen(true)");
    expect(view).toContain("void cancelGuard.run(() => cancelOrder())");
    expect(view).toContain("<DibayBottomSheet");
    expect(view).toContain("isStoreOrderCancelReasonValid(refundReason)");
    expect(view).not.toContain("mypage_comp_back_to_list_full");
    expect(view).toContain("storeOrderSeedStatusLabel(seed, language");
    expect(view).not.toContain("toLocaleString(dateLocale)");
    // 시드 작성처가 수령 방식을 넘긴다(매장 도메인 1필드)
    expect(src("components/stores/StoreCommerceCartPageClient.tsx")).toContain("fulfillment_type: fulfillment,");
  });
});

describe("S40·S41·S43·S46 확인·제출 방지·오류≠빈", () => {
  it("S40 충전 요청 취소는 확인 시트를 거친다", () => {
    const page = code("app/(main)/mypage/points/page.tsx");
    expect(page).toContain("setCancelTarget(id)");
    expect(page).toContain("cancelGuard.run(() => cancelCharge(id))");
    expect(page).toContain("useMypageTabParam<PointsScreenTab>");
    expect(page).not.toContain("MainFeedRouteLoading");
    expect(page).not.toMatch(PALETTE);
  });

  it("S41 제출 가드 + 서버 오류 코드 미노출", () => {
    const form = code("components/points/PointChargeForm.tsx");
    expect(form).toContain("useMypageSubmitGuard()");
    expect(form).not.toContain("j.error ??");
    expect(form).toContain("<MyStickyCta");
  });

  it("S43 목록 오류를 빈 목록으로 바꾸지 않는다", () => {
    const page = code("app/(main)/mypage/points/promotions/page.tsx");
    expect(page).not.toContain("setOrders([])");
    expect(page).toContain("setOrdersError(true)");
  });

  it("S46 오류를 빈 목록으로 바꾸지 않고, 취소는 확인 시트", () => {
    const page = code("app/(main)/mypage/ads/MyAdsPageClient.tsx");
    expect(page).toContain("setLoadFailed(true)");
    expect(page).toContain("setCancelTarget({ kind: \"banner\", id: r.id })");
    expect(page).toContain("DibayActionSheet");
    for (const id of ["feed-ad-cancel-", "revenue-hub-feed-ad-status", "feed-ad-view-"]) expect(page).toContain(id);
    expect(code("app/(main)/mypage/ads/feed-request/page.tsx")).toContain('testId: "feed-ad-submit"');
  });

  it("Part D — 사용처 0 중복 주문 라벨 표 제거", () => {
    const i18n = code("lib/mypage/store-order-detail-i18n.ts");
    expect(i18n).not.toContain("export function buyerOrderStatusLabels");
    expect(i18n).not.toContain("export function fulfillLabels");
  });
});
