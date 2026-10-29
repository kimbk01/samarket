import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  closeStoreCommerceRouteScopedOverlays,
  shouldCloseStoreCommerceOverlaysOnPathChange,
} from "@/lib/stores/close-store-commerce-route-overlays";
import {
  requestStoreCartBulkClearReplace,
  useStoreCartConflictUIStore,
} from "@/lib/stores/store-cart-conflict-ui-store";
import { openStoreCartPreview, useStoreCartPreviewUIStore } from "@/lib/stores/store-cart-preview-ui-store";
import { openStoreProductSheet, useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import { showStoreDetailToast, useStoreDetailToastUIStore } from "@/lib/stores/store-detail-toast-ui-store";
import { BUYER_ORDER_SLIDE_OVERLAY_Z_CLASS } from "@/lib/stores/buyer-order-slide-panel-layout";
import { OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";
import { BAEMIN_CART_TYPE } from "@/lib/stores/store-baemin-cart-ui";
import { DELIVERY_TOUCH_HIT_EXPAND_CLASS } from "@/lib/stores/delivery-touch-target";
import { storeCommerceUiMessages } from "@/lib/i18n/catalog/store-commerce-ui";

const ROOT = join(__dirname, "..", "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 주석 제외 */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("S2-03 — 배달 전역 오버레이는 화면 이동 시 닫힌다", () => {
  beforeEach(() => {
    useStoreProductSheetUIStore.getState().closeSheet();
    useStoreCartPreviewUIStore.getState().closePreview();
    useStoreCartConflictUIStore.setState({
      open: false,
      mode: null,
      pendingLine: null,
      existing: null,
      target: null,
      onResolved: null,
      bulkClearResolve: null,
    });
  });

  it("pathname 이 바뀔 때만 닫기 (최초 마운트·쿼리만 변경은 유지)", () => {
    expect(shouldCloseStoreCommerceOverlaysOnPathChange(null, "/stores/a")).toBe(false);
    expect(shouldCloseStoreCommerceOverlaysOnPathChange("/stores/a", "/stores/a")).toBe(false);
    expect(shouldCloseStoreCommerceOverlaysOnPathChange("/stores/a", "/stores/a?tab=info")).toBe(false);
    expect(shouldCloseStoreCommerceOverlaysOnPathChange("/stores/a", "/stores/a/cart")).toBe(true);
  });

  it("옵션 시트·미리보기·담기 확인을 모두 닫고, 대기 중인 bulk clear 는 false 로 끝낸다", async () => {
    openStoreProductSheet({ productId: "p1", pageStoreSlug: "a" });
    openStoreCartPreview({ storeId: "s1", storeSlug: "a" });
    const pending = requestStoreCartBulkClearReplace(
      { storeId: "s0", storeSlug: "z", storeName: "Z", itemCount: 1, subtotalPhp: 100 },
      { storeId: "s1", storeSlug: "a", storeName: "A" }
    );
    expect(useStoreProductSheetUIStore.getState().productId).toBe("p1");
    expect(useStoreCartPreviewUIStore.getState().open).toBe(true);
    expect(useStoreCartConflictUIStore.getState().open).toBe(true);

    closeStoreCommerceRouteScopedOverlays();

    expect(useStoreProductSheetUIStore.getState().productId).toBeNull();
    expect(useStoreCartPreviewUIStore.getState().open).toBe(false);
    expect(useStoreCartConflictUIStore.getState().open).toBe(false);
    await expect(pending).resolves.toBe(false);
  });

  it("경로 변경 effect · 미리보기 「장바구니 보기」 닫기 · 담기 확인 「장바구니 보기」 시트 닫기가 연결돼 있다", () => {
    expect(code("components/layout/providers/StoreCommerceCartRuntimeBoundary.tsx")).toMatch(
      /shouldCloseStoreCommerceOverlaysOnPathChange\(prev, pathname\)[\s\S]*closeStoreCommerceRouteScopedOverlays\(\)/
    );
    expect(code("components/stores/store-order-detail/StoreCartPreviewSheet.tsx")).toMatch(
      /href=\{cartHref\}[\s\S]*onClick=\{\(e\) => \{[\s\S]*onClose\(\);/
    );
    expect(code("components/stores/cart/StoreCartConflictPortal.tsx")).toMatch(
      /const onViewCart = \(\) => \{[\s\S]*closeStoreCartConflict\(\);\s*closeStoreProductSheet\(\);/
    );
  });
});

describe("S2-04 · S2-05 · S2-06 — 소비자 패널·내역서는 오버레이 back stack·하단 탭 위 레이어", () => {
  it("구매자 슬라이드 패널 z = 오버레이 SSOT 시트 레이어(하단 탭 z-1200 위), 오너 z-80/81 미사용", () => {
    expect(BUYER_ORDER_SLIDE_OVERLAY_Z_CLASS).toBe(OVERLAY_Z_CLASS.sheet);
    const z = Number(/z-\[(\d+)\]/.exec(BUYER_ORDER_SLIDE_OVERLAY_Z_CLASS)?.[1]);
    expect(z).toBeGreaterThan(1200);
    for (const rel of [
      "components/mypage/BuyerStoreOrderReviewSlidePanel.tsx",
      "components/mypage/BuyerStoreOrderChatSlidePanel.tsx",
    ]) {
      const c = code(rel);
      expect(c).not.toMatch(/OWNER_ORDER_CHAT_SLIDE_(BACKDROP|PANEL)_Z_CLASS/);
      expect(c).toMatch(/fixed inset-0 \$\{BUYER_ORDER_SLIDE_OVERLAY_Z_CLASS\}/);
      expect(c).toMatch(/useOverlayHardwareBack\(true, requestClose\)/);
    }
    // 오너 파일은 그대로
    expect(src("lib/store-order-chat/owner-order-chat-slide-layout.ts")).toMatch(
      /OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS = "z-\[81\]"/
    );
  });

  it("매장 리뷰 패널은 열린 동안 hardware back 에 등록된다", () => {
    expect(code("components/stores/store-detail/StoreReviewsSlidePanel.tsx")).toMatch(
      /useOverlayHardwareBack\(open, onRequestClose\)/
    );
  });

  it("주문 내역서는 DibayBottomSheet(z·dvh·스크롤 잠금·back stack) — 자체 z-50/85vh 없음", () => {
    const c = code("components/mypage/StoreOrderReceiptSheet.tsx");
    expect(c).toMatch(/<DibayBottomSheet[\s\S]*open=\{open\}[\s\S]*onClose=\{onClose\}/);
    expect(c).not.toMatch(/z-50/);
    expect(c).not.toMatch(/85vh/);
    expect(c).not.toMatch(/env\(safe-area-inset/);
  });
});

describe("S2-11 — 옵션 시트 링크 라벨 = 이동 대상(메뉴 상세)", () => {
  it("상품 상세 링크에 「매장 보기」를 쓰지 않는다", () => {
    const c = code("components/stores/StoreProductAddSheet.tsx");
    expect(c).not.toMatch(/common_view_store/);
    expect(c).toMatch(/\/p\/\$\{encodeURIComponent\(product\.id\)\}[\s\S]{0,400}store_sheet_view_menu_detail/);
    expect(storeCommerceUiMessages.ko.store_sheet_view_menu_detail).toBe("메뉴 상세 보기");
    expect(storeCommerceUiMessages.en.store_sheet_view_menu_detail).toBe("View menu details");
  });
});

describe("S2-13 · UI-15 — 장바구니 줄 삭제는 확인 후", () => {
  it("미리보기 — 최소 수량 「−」는 삭제 확인, 「삭제」 링크도 확인을 거친다", () => {
    const c = code("components/stores/store-order-detail/StoreCartPreviewLineRow.tsx");
    expect(c).toMatch(/onClick=\{atMin \? \(\) => setDeleteConfirmOpen\(true\) : onDecrease\}/);
    expect(c).toMatch(/onClick=\{\(\) => setDeleteConfirmOpen\(true\)\}/);
    expect(c).not.toMatch(/onClick=\{onRemove\}/);
    expect(c).toMatch(/<StoreCartLineDeleteConfirmDialog[\s\S]*onRemove\(\)/);
  });

  /**
   * WP8 (Owner 승인 배민형 3차수 2026-10-30) — 의도 변경: 장바구니 페이지 최소 수량 🗑 는 확인 없이 바로 삭제
   * (`docs/audit/delivery-baemin-master-plan-2026-10-29.md` WP8). 미리보기 시트(위)는 기존 확인 유지.
   */
  it("장바구니 페이지 — 최소 수량 🗑 는 확인 없이 바로 삭제 (WP8)", () => {
    const c = code("components/stores/cart/baemin/StoreBaeminCartLineRow.tsx");
    expect(c).toMatch(/onClick=\{showTrash \? onRemove : onDecrease\}/);
    expect(c).not.toContain("setDeleteConfirmOpen");
    expect(code("components/stores/cart/StoreCartLineDeleteConfirmDialog.tsx")).toMatch(/confirmTone="destructive"/);
  });

  it("최근 검색어 삭제·전체 삭제는 되돌리기를 제공한다", () => {
    const c = code("components/delivery/search/RecentSearchChips.tsx");
    expect(c).toMatch(/armUndo\(prev, "one"\)/);
    expect(c).toMatch(/armUndo\(prev, "all"\)/);
    expect(c).toMatch(/onClick=\{restore\}/);
  });
});

describe("S2-16 — 같은 토스트 문구 재요청 시 자동 숨김 타이머 재시작", () => {
  it("dedupe 창 안의 같은 문구는 openedAt 을 갱신한다 (portal effect 의 deps)", () => {
    useStoreDetailToastUIStore.getState().hideToast();
    showStoreDetailToast("store-x", "담았어요 (w4)");
    const first = useStoreDetailToastUIStore.getState().openedAt;
    expect(first).toBeGreaterThan(0);
    const realNow = Date.now;
    try {
      Date.now = () => first + 500;
      showStoreDetailToast("store-x", "담았어요 (w4)");
    } finally {
      Date.now = realNow;
    }
    const s = useStoreDetailToastUIStore.getState();
    expect(s.message).toBe("담았어요 (w4)");
    expect(s.openedAt).toBe(first + 500);
    expect(code("components/stores/detail/StoreDetailToastPortal.tsx")).toMatch(/\}, \[message, openedAt\]\);/);
  });
});

describe("UI-11 · S3-08 — 터치 영역 ≥ 44px", () => {
  it("공용 hit 확장 클래스는 --delivery-touch-min(44px) 기준", () => {
    expect(DELIVERY_TOUCH_HIT_EXPAND_CLASS).toContain("after:h-[var(--delivery-touch-min)]");
    expect(DELIVERY_TOUCH_HIT_EXPAND_CLASS).toContain("after:w-[max(100%,var(--delivery-touch-min))]");
    expect(src("app/delivery-tokens.css")).toMatch(/--delivery-touch-min: 44px;/);
  });

  it("장바구니 스테퍼 = 44px", () => {
    expect(BAEMIN_CART_TYPE.btnQty).toBe("h-[var(--delivery-touch-min)]");
    expect(BAEMIN_CART_TYPE.btnQtyStep).toBe("w-[var(--delivery-touch-min)]");
  });

  it("지정 지점이 터치 클래스를 쓴다", () => {
    const hit: Array<[string, RegExp]> = [
      ["components/stores/store-order-detail/StoreOrderHeroSummary.tsx", /store_manage_my_shop|DELIVERY_TOUCH_HIT_EXPAND_CLASS/],
      ["components/stores/browse/StoresBrowsePrimaryIndustryMenuPanel.tsx", /DELIVERY_TOUCH_HIT_EXPAND_CLASS/],
      ["components/stores/cart/StoreCartCouponApplyPanel.tsx", /DELIVERY_TOUCH_HIT_EXPAND_CLASS/],
      ["components/stores/cart/StoreCartGiftApplyPanel.tsx", /DELIVERY_TOUCH_HIT_EXPAND_CLASS/],
      ["components/stores/browse/StoreListFilters.tsx", /h-\[var\(--delivery-sticky-tab-h\)\][\s\S]*DELIVERY_TOUCH_HIT_EXPAND_CLASS/],
    ];
    for (const [rel, re] of hit) expect(code(rel), rel).toMatch(re);
    const hero = code("components/stores/store-order-detail/StoreOrderHeroSummary.tsx");
    /** WP6 (2026-10-29) — 「가게정보」 알약 버튼 추가로 2 → 3 */
    expect(hero.match(/DELIVERY_TOUCH_HIT_EXPAND_CLASS\}/g)?.length).toBe(3);
    const cart = code("components/stores/StoreCommerceCartPageClient.tsx");
    expect(cart.match(/\$\{DELIVERY_TOUCH_TEXT_LINK_CLASS\} rounded-\[var\(--delivery-radius\)\]/g)?.length).toBe(3);
    expect(code("components/stores/product-sheet/StoreProductSheetHeader.tsx")).toMatch(
      /h-\[var\(--delivery-touch-min\)\] w-\[var\(--delivery-touch-min\)\]/
    );
    expect(code("components/mypage/StoreOrderReviewForm.tsx")).toMatch(
      /h-\[var\(--delivery-touch-min\)\] w-\[var\(--delivery-touch-min\)\] items-start justify-end/
    );
    expect(code("components/stores/store-order-detail/StoreCartPreviewLineRow.tsx")).not.toMatch(/h-8 w-8/);
    expect(src("app/delivery-components.css")).toMatch(
      /\.delivery-menu-plus::after \{[\s\S]*width: var\(--delivery-touch-min\);[\s\S]*height: var\(--delivery-touch-min\);/
    );
  });
});
