import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));
vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({
  markOrderNotificationsRead: vi.fn(async () => 1),
}));

import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { notifyBuyerStoreOrderOwnerStatus } from "@/lib/notifications/notify-store-commerce";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { isStoreOrderBuyerHideAllowedStatus } from "@/lib/stores/store-order-process-model";
import { resolveStoreOrderMutationErrorKey } from "@/lib/mypage/my-store-orders-ui";
import { shouldEnableStoreOrderSupportFab } from "@/lib/support/store-order-support-fab";
import { SUPPORT_FAB_ENABLED_VIEW_FILES } from "@/lib/support/support-fab-route-registry";
import { isDeliveryLoadErrorStatus } from "@/lib/stores/delivery-load-error-status";
import {
  storesHomeShouldRenderEmptyFallback,
  storesHomeShouldRenderLoadError,
} from "@/lib/stores/stores-home-feed-state-classification";
import { STORES_HOME_CONTENT_COLUMN_CLASS } from "@/lib/stores/stores-home-ui";
import { notificationMessages } from "@/lib/i18n/catalog/notifications";

const ROOT = join(__dirname, "..", "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** 주석 제외 */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("FLW-01 · FLW-07 — 정식 패널 취소·취소 요청", () => {
  const panel = code("components/mypage/MyStoreOrderExpandPanel.tsx");
  const list = code("components/mypage/MyStoreOrdersView.tsx");

  it("패널은 확인 없이 바로 취소 PATCH 하지 않고 목록의 확인 흐름(onRequestCancel)을 쓴다", () => {
    expect(panel).not.toMatch(/patchMeStoreOrder\(orderId, \{ cancel: true \}\)/);
    expect(panel).toMatch(/canBuyerCancel && onRequestCancel \?/);
    expect(panel).toMatch(/onClick=\{onRequestCancel\}/);
    // 목록: 카드 → 패널로 같은 확인 시트(requestCancelPending → MobileConfirmBottomSheet → runCancelPending) 연결
    expect(list).toMatch(/onRequestCancel=\{onCancelPending \? \(\) => onCancelPending\(o\.id\) : undefined\}/);
    expect(list).toMatch(/onCancelPending=\{requestCancelPending\}/);
    expect(list).toMatch(/runCancelPending[\s\S]*resolveStoreOrderMutationErrorKey\("cancel", j\?\.error\)/);
  });

  it("취소 요청 성공 시 내정보 상세와 같은 토스트(mypage_oa_cancel_request_sent)", () => {
    expect(panel).toMatch(/onNotify\?\.\(t\("mypage_oa_cancel_request_sent"\), "success"\)/);
    expect(list).toMatch(/onNotify=\{notify\}/);
  });

  it("패널 로드 실패 = 공용 오류 상태 + 재시도", () => {
    expect(panel).toMatch(/<MyStateView\s+kind="error"[\s\S]*onRetry: \(\) => void load\(\{ force: true \}\)/);
  });
});

describe("FLW-02 — 픽업 완료 라벨 (프로세스 모델 단일 정의)", () => {
  it("pickup completed = 픽업 완료 / Picked up, delivery completed = 배달완료 / Delivered", () => {
    expect(buyerOrderStatusLabel("completed", "ko", "pickup")).toBe("픽업 완료");
    expect(buyerOrderStatusLabel("completed", "en", "pickup")).toBe("Picked up");
    expect(buyerOrderStatusLabel("completed", "ko", "local_delivery")).toBe("배달완료");
    expect(buyerOrderStatusLabel("completed", "en", "local_delivery")).toBe("Delivered");
  });
});

describe("FLW-03 — 진행 중 주문 숨김 금지 (UI·API)", () => {
  it("종료 집합(완료·취소·환불 완료)만 숨김 허용", () => {
    for (const s of ["completed", "cancelled", "refunded"]) expect(isStoreOrderBuyerHideAllowedStatus(s)).toBe(true);
    for (const s of [
      "pending",
      "accepted",
      "preparing",
      "ready_for_pickup",
      "delivering",
      "arrived",
      "cancel_requested",
      "refund_requested",
    ]) {
      expect(isStoreOrderBuyerHideAllowedStatus(s)).toBe(false);
    }
  });

  it("API DELETE 는 order_not_hideable(409) 로 거부, 화면 문구 키로 변환", () => {
    const api = code("app/api/me/store-orders/[orderId]/route.ts");
    expect(api).toMatch(/\.select\("id, order_status"\)/);
    expect(api).toMatch(
      /if \(!isStoreOrderBuyerHideAllowedStatus\(orderStatus\)\) \{\s*return NextResponse\.json\(\{ ok: false, error: "order_not_hideable" \}, \{ status: 409 \}\);/
    );
    expect(resolveStoreOrderMutationErrorKey("hide", "order_not_hideable")).toBe("mypage_comp_orders_hide_err_in_progress");
  });

  it("목록 ⋯(숨기기)는 종료 주문에만 노출", () => {
    expect(code("components/mypage/MyStoreOrdersView.tsx")).toMatch(
      /allowDelete && onDelete && isStoreOrderBuyerHideAllowedStatus\(o\.order_status\)/
    );
  });
});

describe("FLW-05 — 주문 단위 고객센터 진입", () => {
  it("상태 목록: cancel_requested 포함, 존재하지 않는 refund_rejected 미사용", () => {
    expect(shouldEnableStoreOrderSupportFab({ order_status: "cancel_requested" })).toBe(true);
    expect(shouldEnableStoreOrderSupportFab({ order_status: "refund_requested" })).toBe(true);
    expect(shouldEnableStoreOrderSupportFab({ order_status: "cancelled" })).toBe(true);
    expect(shouldEnableStoreOrderSupportFab({ order_status: "accepted" })).toBe(false);
    expect(code("lib/support/store-order-support-fab.ts")).not.toMatch(/"refund_rejected"/);
  });

  it("정식 패널도 ORDER · STORE_ORDER 컨텍스트를 게시한다", () => {
    const panel = code("components/mypage/MyStoreOrderExpandPanel.tsx");
    expect(panel).toMatch(/<SupportContextProvider value=\{supportContext\}>/);
    expect(panel).toMatch(/category: "ORDER"/);
    expect(panel).toMatch(/referenceType: "STORE_ORDER"/);
    expect(SUPPORT_FAB_ENABLED_VIEW_FILES).toContain("components/mypage/MyStoreOrderExpandPanel.tsx");
  });
});

describe("FLW-06 — 구매자 취소 요청 승인 알림 문구", () => {
  type Row = Record<string, unknown> | null;
  function makeSb(cancelRequestRow: Row) {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => {
        const chain = {
          eq: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => {
            if (table === "store_order_cancel_requests") return { data: cancelRequestRow, error: null };
            if (table === "profiles") return { data: { preferred_language: "ko" }, error: null };
            if (table === "stores") return { data: { store_name: "테스트매장" }, error: null };
            return { data: null, error: null };
          }),
        };
        return chain;
      }),
    }));
    return { from } as unknown as Parameters<typeof notifyBuyerStoreOrderOwnerStatus>[0];
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("오너가 구매자 요청을 승인 → 「취소 요청이 승인」 문구 + cancel_by buyer_request", async () => {
    await notifyBuyerStoreOrderOwnerStatus(makeSb({ id: "req-1" }), {
      buyerUserId: "buyer-1",
      orderId: "order-1",
      orderNo: "SO1",
      storeId: "store-1",
      nextStatus: "cancelled",
      actor: "OWNER",
    });
    expect(appendUserNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: "「테스트매장」 SO1 주문 취소 요청이 승인되어 주문이 취소되었습니다.",
        meta: expect.objectContaining({ cancel_by: "buyer_request", order_status: "cancelled" }),
      })
    );
  });

  it("구매자 요청 승인 원장이 없으면 기존 「매장에 의해 취소」 문구 유지", async () => {
    await notifyBuyerStoreOrderOwnerStatus(makeSb(null), {
      buyerUserId: "buyer-1",
      orderId: "order-1",
      orderNo: "SO1",
      storeId: "store-1",
      nextStatus: "cancelled",
      actor: "OWNER",
    });
    expect(appendUserNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: "「테스트매장」 SO1 주문이 매장에 의해 취소되었습니다.",
        meta: expect.objectContaining({ cancel_by: "owner" }),
      })
    );
  });

  it("알림함 재번역도 buyer_request 문구를 쓴다 (ko·en 키 존재)", () => {
    expect(code("lib/notifications/resolve-commerce-notification-inbox-text.ts")).toMatch(
      /m\.cancel_by === "buyer_request"\) return \{ key: "notify_commerce_cancel_request_approved_body" \}/
    );
    expect(notificationMessages.ko.notify_commerce_cancel_request_approved_body).toBeTruthy();
    expect(notificationMessages.en.notify_commerce_cancel_request_approved_body).toBeTruthy();
  });
});

describe("DSC-06 · S3-04 — 불러오기 실패 ≠ 없음, 재시도", () => {
  it("오류 상태 코드 분류", () => {
    for (const s of [0, 408, 429, 500, 502, 503]) expect(isDeliveryLoadErrorStatus(s)).toBe(true);
    for (const s of [200, 400, 401, 404]) expect(isDeliveryLoadErrorStatus(s)).toBe(false);
  });

  it("홈: 실패면 빈 상태 대신 오류", () => {
    const base = { loading: false, storeCount: 0, visibleSlotCount: 0 };
    expect(storesHomeShouldRenderLoadError({ ...base, loadFailed: true })).toBe(true);
    expect(storesHomeShouldRenderEmptyFallback({ ...base, loadFailed: true })).toBe(false);
    expect(storesHomeShouldRenderLoadError({ ...base, loadFailed: false })).toBe(false);
    expect(storesHomeShouldRenderEmptyFallback({ ...base, loadFailed: false })).toBe(true);
    // 표시 중인 행이 있으면 오류 화면으로 덮지 않음
    expect(storesHomeShouldRenderLoadError({ ...base, storeCount: 3, loadFailed: true })).toBe(false);
  });

  it("각 화면이 같은 공용 상태 컴포넌트(MyStateView kind=error + 재시도)를 쓴다", () => {
    const surfaces: Array<[string, RegExp]> = [
      ["components/stores/home/hub/StoresHomeHub.tsx", /onRetry: \(\) => void loadFeed\(\{ silent: false, force: true \}\)/],
      ["components/stores/browse/StoresBrowsePrimaryView.tsx", /showLoadErrorBlock \?[\s\S]*onRetry: \(\) => void loadRemote/],
      ["components/delivery/search/DeliverySearchResults.tsx", /!hasAny && loadFailed && onRetry/],
      ["components/stores/StoreReviewsSection.tsx", /loadFailed && reviews\.length === 0/],
      ["components/stores/StoreDetailPublic.tsx", /!storeForPaint && detailLoadFailed && !dbOff/],
      ["components/stores/StoreProductPublic.tsx", /loadFailed && \(!product \|\| !store\)/],
      ["components/stores/StoreDetailInfoPublic.tsx", /!store && loadFailed/],
    ];
    for (const [rel, re] of surfaces) {
      const c = code(rel);
      expect(c, rel).toMatch(re);
      expect(c, rel).toMatch(/<MyStateView\s+kind="error"/);
    }
  });
});

describe("S3-06 — 하위 화면 헤더·뒤로", () => {
  it("리뷰 닫기는 Back resolver, 매장 PUSH 하드코딩 없음", () => {
    const c = code("components/stores/StoreReviewsPageClient.tsx");
    expect(c).not.toMatch(/router\.push/);
    expect(c).toMatch(/useStoreDetailBackPress\(keySlug\)/);
    expect(code("components/stores/StoreDetailBackRow.tsx")).toMatch(
      /export function useStoreDetailBackPress[\s\S]*resolveDibayBackTarget\(/
    );
  });

  it("정보·신고 헤더 = DeliverySubpageHeader", () => {
    const c = code("components/stores/StoreSubpageHeaderBar.tsx");
    expect(c).toMatch(/<DeliverySubpageHeader title=\{title\} onBack=\{onBack\}/);
    expect(c).toMatch(/useStoreDetailBackPress\(storeSlug\)/);
  });
});

describe("S3-07 — 배달 소비자 본문 폭 768px 단일 상수", () => {
  it("상수 = 홈 hub 768px", () => {
    expect(STORES_HOME_CONTENT_COLUMN_CLASS).toContain("max-w-[768px]");
  });
  it.each([
    ["components/delivery/search/DeliverySearchPage.tsx", /max-w-lg/],
    ["components/stores/delivery/RestaurantOrderCompleteClient.tsx", /mx-auto max-w-md/],
    ["components/stores/StoreReviewsPageClient.tsx", /^$/],
    ["components/orders/customer-commerce/CustomerCommerceHubBody.tsx", /^$/],
  ])("%s", (rel, legacy) => {
    const c = code(rel);
    expect(c).toMatch(/STORES_HOME_CONTENT_COLUMN_CLASS/);
    if (legacy.source !== "^$") expect(c).not.toMatch(legacy);
  });
  it("store detail sticky header row uses the same column as the store body (APP_MAIN_COLUMN)", () => {
    const c = code("components/stores/store-order-detail/StoreOrderStickyHeader.tsx");
    expect(c).toMatch(/APP_MAIN_COLUMN_CLASS/);
    expect(c).not.toMatch(/max-w-\[42rem\]/);
  });
});
