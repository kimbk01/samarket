// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  StoreCommerceCartProvider,
  useStoreCommerceCart,
} from "@/contexts/StoreCommerceCartContext";
import type { AddStoreCartLineInput } from "@/lib/stores/store-commerce-cart-types";
import {
  clearPendingStoreOrderClientKey,
  readPendingStoreOrderClientKey,
  writePendingStoreOrderClientKey,
} from "@/lib/stores/store-order-pending-client-key";
import { clearCommerceCartStorage } from "@/lib/stores/store-commerce-cart-storage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const line = (productId: string): AddStoreCartLineInput => ({
  storeId: "store-a",
  storeSlug: "a",
  storeName: "A",
  productId,
  title: productId,
  thumbnailUrl: null,
  qty: 1,
  unitPricePhp: 100,
  optionSelections: {},
  optionsSummary: "",
  pickupAvailable: true,
  localDeliveryAvailable: true,
  shippingAvailable: false,
  minOrderQty: 1,
  maxOrderQty: 9,
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe("CRT-08 addOrMergeLine 결과는 갱신 함수 밖에서 계산", () => {
  it("대기 중 업데이트(clearAllCarts) 직후 연속 담기 — TypeError 없이 결과·상태 정합", () => {
    const holder: { cart: ReturnType<typeof useStoreCommerceCart> | null } = { cart: null };
    function Probe() {
      const c = useStoreCommerceCart();
      useEffect(() => {
        holder.cart = c;
      });
      return null;
    }
    act(() => {
      root = createRoot(host!);
      root.render(
        <StoreCommerceCartProvider>
          <Probe />
        </StoreCommerceCartProvider>
      );
    });
    const results: unknown[] = [];
    act(() => {
      // 재주문 경로와 같은 순서: 대기 중 setState 뒤 같은 틱에서 여러 줄 담기
      holder.cart!.clearAllCarts();
      results.push(holder.cart!.addOrMergeLine(line("p1")));
      results.push(holder.cart!.addOrMergeLine(line("p2")));
    });
    expect(results).toEqual([
      { ok: true, reason: "added" },
      { ok: true, reason: "added" },
    ]);
    expect(holder.cart!.getLinesForStoreId("store-a").map((l) => l.productId)).toEqual(["p1", "p2"]);
  });

  it("다른 매장 장바구니가 있으면 차단 결과를 바로 돌려준다", () => {
    const holder: { cart: ReturnType<typeof useStoreCommerceCart> | null } = { cart: null };
    function Probe() {
      const c = useStoreCommerceCart();
      useEffect(() => {
        holder.cart = c;
      });
      return null;
    }
    act(() => {
      root = createRoot(host!);
      root.render(
        <StoreCommerceCartProvider>
          <Probe />
        </StoreCommerceCartProvider>
      );
    });
    act(() => {
      holder.cart!.addOrMergeLine(line("p1"));
    });
    let blocked: unknown = null;
    act(() => {
      blocked = holder.cart!.addOrMergeLine({ ...line("x1"), storeId: "store-b", storeSlug: "b" });
    });
    expect(blocked).toMatchObject({ ok: false, reason: "blocked_by_other_store" });
    expect(holder.cart!.getLinesForStoreId("store-a")).toHaveLength(1);
  });
});

describe("ORD-C-07 pending client_order_key (localStorage, cart 와 같은 수명)", () => {
  it("같은 매장·같은 fingerprint 면 재사용, 다르면 사용 안 함, 삭제 후 없음", () => {
    writePendingStoreOrderClientKey("store-a", "fp-1", "key-1", 1_000);
    expect(readPendingStoreOrderClientKey("store-a", "fp-1", 2_000)).toBe("key-1");
    expect(readPendingStoreOrderClientKey("store-a", "fp-2", 2_000)).toBeNull();
    expect(readPendingStoreOrderClientKey("store-b", "fp-1", 2_000)).toBeNull();
    clearPendingStoreOrderClientKey("store-a");
    expect(readPendingStoreOrderClientKey("store-a", "fp-1", 2_000)).toBeNull();
  });

  it("24시간이 지난 키는 무시", () => {
    writePendingStoreOrderClientKey("store-a", "fp-1", "key-1", 0);
    expect(readPendingStoreOrderClientKey("store-a", "fp-1", 24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("WebView 재시작(sessionStorage 소실) 후에도 키가 남는다", () => {
    writePendingStoreOrderClientKey("store-a", "fp-1", "key-1", 1_000);
    sessionStorage.clear();
    expect(readPendingStoreOrderClientKey("store-a", "fp-1", 2_000)).toBe("key-1");
  });

  it("로그아웃·계정 전환(clearCommerceCartStorage) 시 모든 매장 키를 지운다", () => {
    writePendingStoreOrderClientKey("store-a", "fp-1", "key-1", 1_000);
    writePendingStoreOrderClientKey("store-b", "fp-2", "key-2", 1_000);
    localStorage.setItem("unrelated", "keep");
    clearCommerceCartStorage();
    expect(readPendingStoreOrderClientKey("store-a", "fp-1", 2_000)).toBeNull();
    expect(readPendingStoreOrderClientKey("store-b", "fp-2", 2_000)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });
});

const cartSrc = readFileSync(
  path.join(process.cwd(), "components/stores/StoreCommerceCartPageClient.tsx"),
  "utf8"
);
const sheetSrc = readFileSync(path.join(process.cwd(), "components/stores/StoreProductAddSheet.tsx"), "utf8");
const portalSrc = readFileSync(
  path.join(process.cwd(), "components/stores/product-sheet/StoreProductSheetPortal.tsx"),
  "utf8"
);

describe("ORD-C-08 · CRT-05 · S2-01 계약", () => {
  it("멱등 fingerprint 에 쿠폰·상품권 선택 포함", () => {
    const fp = cartSrc.slice(cartSrc.indexOf("const orderSubmitFingerprint"));
    const body = fp.slice(0, fp.indexOf("useEffect("));
    expect(body).toContain("user_coupon_id: appliedUserCouponId");
    expect(body).toContain("coupon_campaign_id: appliedCouponCampaignId");
    expect(body).toContain("gift_instance_id: appliedGiftInstanceId");
  });

  it("주문 확인창 총액 = 결제 예정액(computeStoreCheckoutPayable)", () => {
    const confirm = cartSrc.slice(cartSrc.indexOf("const grandForConfirm"));
    expect(confirm.slice(0, 200)).toContain("computeStoreCheckoutPayable(");
    expect(cartSrc).toContain("const displayGrand = checkoutPayable.payablePhp");
  });

  it("옵션 변경 시트는 편집 줄(editCartLine)로 수량·옵션·메모를 시작", () => {
    expect(portalSrc).toContain("editCartLine={editCartLine}");
    expect(sheetSrc).toContain("setQty(clampCartSeedQty(editLineForProduct");
    expect(sheetSrc).toContain("setModifierWire(modifierWireFromCartLine(editLineForProduct))");
    expect(sheetSrc).toContain('setLineNote(editLineForProduct.lineNote?.trim() ?? "")');
  });
});
