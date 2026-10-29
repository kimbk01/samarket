// @vitest-environment jsdom
/**
 * 묶음3-A S-02·S-03·C-04·C-07 — 렌더 계약.
 * - 하단 바: 카트가 있어도 영업 외 시간·판매 불가면 「주문 가능」 문구·활성 CTA 금지
 * - 메뉴판: 로드 실패 = 오류+재시도 / 메뉴 0개 = 「등록된 상품 없음」 / 검색 빈 결과만 「검색 결과 없음」
 * - 샘플 배지: isSampleStore=true 일 때만
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { FALLBACK_APP_LANGUAGE } from "@/lib/i18n/config";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/stores/demo",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import { StoreMenuBoardList } from "@/components/stores/detail/StoreMenuBoardList";
import { StoreSampleStoreBadge } from "@/components/stores/StoreSampleStoreBadge";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = (k: Parameters<typeof translate>[1]) => translate(FALLBACK_APP_LANGUAGE, k);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
function render(node: ReactNode) {
  act(() => root!.render(node));
  return host!;
}
/** 하단 바는 body 포털로 렌더될 수 있어 document.body 기준으로 조회 */
function renderToBody(node: ReactNode) {
  act(() => root!.render(node));
  return document.body;
}

const stripBase = {
  slug: "demo",
  deliveryAvailable: true,
  fulfillmentMode: "local_delivery" as const,
  cartTotalPhp: 500,
  cartQtyTotal: 2,
  cartLineKindCount: 1,
  minOrderPhp: null,
  onCartPreviewOpen: () => {},
};

describe("C-07·S-02 — 상세 하단 바", () => {
  it("카트 있음 + 영업 중 + 판매 가능 → 「주문 가능」 + 활성 주문 링크", () => {
    const el = renderToBody(<StoreDetailBottomStrip {...stripBase} isOpen />);
    expect(el.textContent).toContain(t("store_bottom_status_delivery_open"));
    expect(el.querySelector("[data-store-checkout-blocked]")).toBeNull();
    expect(el.querySelector("a[href]")).not.toBeNull();
  });
  it("카트 있음 + 영업 외 시간 → 「주문 가능」 없음, CTA 비활성", () => {
    const el = renderToBody(<StoreDetailBottomStrip {...stripBase} isOpen={false} />);
    expect(el.textContent).not.toContain(t("store_bottom_status_delivery_open"));
    expect(el.textContent).toContain(t("store_bottom_status_closed"));
    const btn = el.querySelector("[data-store-checkout-blocked]") as HTMLButtonElement | null;
    expect(btn?.getAttribute("data-store-checkout-blocked")).toBe("closed");
    expect(btn?.disabled).toBe(true);
  });
  it("카트 있음 + 샘플(판매 미승인) → 샘플 안내 + CTA 비활성", () => {
    const el = renderToBody(<StoreDetailBottomStrip {...stripBase} isOpen salesBlockedReason="sample" />);
    expect(el.textContent).not.toContain(t("store_bottom_status_delivery_open"));
    expect(el.textContent).toContain(t("store_sample_order_blocked"));
    const btn = el.querySelector("[data-store-checkout-blocked]") as HTMLButtonElement | null;
    expect(btn?.getAttribute("data-store-checkout-blocked")).toBe("sales");
    expect(btn?.disabled).toBe(true);
  });
  it("빈 카트 + 판매 승인 전 실매장 → 「주문 가능」 대신 판매 승인 전 안내", () => {
    const el = renderToBody(
      <StoreDetailBottomStrip {...stripBase} cartQtyTotal={0} cartTotalPhp={0} isOpen salesBlockedReason="not_approved" />
    );
    expect(el.textContent).not.toContain(t("store_bottom_status_delivery_open"));
    expect(el.textContent).toContain(t("store_sales_not_open_order_blocked"));
  });
});

describe("C-04 — 메뉴판 빈·오류 상태 분리", () => {
  const boardBase = {
    storeSlug: "demo",
    sections: [],
    canSell: true,
  };
  it("로드 실패 → 오류 + 재시도 (검색 결과 없음 아님)", () => {
    const onRetry = vi.fn();
    const el = render(<StoreMenuBoardList {...boardBase} loadFailed onRetry={onRetry} />);
    expect(el.querySelector('[data-store-menu-state="load_failed"]')).not.toBeNull();
    expect(el.textContent).toContain(t("store_menu_load_failed"));
    expect(el.textContent).not.toContain(t("store_menu_search_no_results"));
    const retry = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(t("common_retry"))
    );
    expect(retry).toBeTruthy();
    act(() => retry!.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("메뉴 0개 → 「등록된 상품이 없습니다」", () => {
    const el = render(<StoreMenuBoardList {...boardBase} />);
    expect(el.textContent).toContain(t("store_menu_no_items_registered"));
    expect(el.textContent).not.toContain(t("store_menu_search_no_results"));
  });
  it("메뉴 검색어 있고 결과 0 → 「검색 결과가 없습니다」", () => {
    const el = render(<StoreMenuBoardList {...boardBase} menuQueryActive />);
    expect(el.textContent).toContain(t("store_menu_search_no_results"));
  });
  it("메뉴 비공개(판매 미승인 실매장) → 기존 판매 승인 전 문구 유지", () => {
    const el = render(<StoreMenuBoardList {...boardBase} canSell={false} />);
    expect(el.textContent).toContain(t("store_menu_sales_paused"));
  });
});

describe("S-03 — 샘플 배지 1컴포넌트", () => {
  it("isSampleStore=true 만 표시", () => {
    let el = render(<StoreSampleStoreBadge isSampleStore />);
    expect(el.querySelector("[data-store-sample-badge]")?.textContent).toBe(t("store_sample_store_badge"));
    el = render(<StoreSampleStoreBadge isSampleStore={false} />);
    expect(el.querySelector("[data-store-sample-badge]")).toBeNull();
  });
});
