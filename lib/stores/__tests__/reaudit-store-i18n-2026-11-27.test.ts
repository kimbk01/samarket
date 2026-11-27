/**
 * 언어 재감사 2026-11-27 — 매장·주문 도메인 (설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md`).
 * 확인: 영어 결과에 한글 0, 한국어 결과에 서버 영어 문장 0, 서버 문장은 화면에 나가지 않는다.
 */
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  formatStoreOrderSummaryForChatMessage,
  formatStoreOrderSummaryText,
  STORE_ORDER_SUMMARY_HEADER,
} from "@/lib/stores/format-store-order-chat-summary";
import { formatStoreOrderCheckoutEtaSummary } from "@/lib/stores/format-store-order-checkout-display";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { parseProductOptionsJson } from "@/lib/stores/modifiers/parse-json";
import {
  ownerAdminLockLabel,
  ownerProductStatusBlockText,
  ownerProductStatusChangeBlock,
} from "@/lib/stores/store-product-admin-lock";
import {
  REORDER_TO_CART_ERROR_KEYS,
  reorderToCartErrorText,
} from "@/lib/stores/apply-completed-order-to-commerce-cart";
import {
  ADMIN_REJECT_LEDGER_REASON_FALLBACK,
  isAdminDefaultRejectReason,
  storeOrderRejectReasonForDisplay,
} from "@/lib/stores/store-order-reject-reason-text";
import { buildStoreOrderChatCardView } from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { resolveDeliveryRoomMessageSenderLabel } from "@/lib/store-order-chat/use-delivery-room-message-sender-label";
import {
  STORE_ADDRESS_DETAIL_LABEL_KEY,
  STORE_ADDRESS_STREET_HINT_KEY,
  STORE_ADDRESS_STREET_LABEL_KEY,
  STORE_ADDRESS_STREET_PLACEHOLDER_KEY,
  STORE_LOCATION_SECTION_HINT_STORE_PUBLIC_KEY,
} from "@/lib/stores/store-address-form-ui";
import {
  isStoreOrderMatchAckText,
  localizeStoreOrderMatchAckText,
  STORE_ORDER_MATCH_ACK_MESSAGE,
} from "@/lib/chats/store-order-match-ack-text";

const HANGUL = /[가-힣]/;
const tFor = (lang: AppLanguageCode) => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

const ORDER = {
  store_name: "Cafe",
  order_no: "A-1",
  order_status: "accepted",
  fulfillment_type: "local_delivery",
  delivery_address_summary: "Makati",
  buyer_phone: "0917",
  buyer_note: "no onion",
  payment_amount: 300,
  discount_amount: 10,
  delivery_fee_amount: 50,
};
const ITEMS = [
  { product_title_snapshot: "Rice", price_snapshot: 100, qty: 2, options_snapshot_json: { v: 2, summary: "L", line_note: "hot" } },
];

describe("주문 채팅 요약 — 카탈로그 키", () => {
  it("en 결과에 한글 0", () => {
    const en = formatStoreOrderSummaryText(ORDER, ITEMS, "en");
    expect(HANGUL.test(en)).toBe(false);
    expect(en).toContain("Order summary");
    expect(en).toContain("Note: hot");
  });

  it("ko 결과는 예전 저장 형식과 같다(레거시 판별 마커 유지)", () => {
    const ko = formatStoreOrderSummaryText(ORDER, ITEMS, "ko");
    expect(ko.startsWith(STORE_ORDER_SUMMARY_HEADER)).toBe(true);
    expect(ko).toContain("주문번호: A-1");
    expect(ko).toContain("— 품목 —");
    expect(ko).toContain("메모: hot");
    expect(ko).not.toMatch(/Order summary|Total:/);
  });

  it("deprecated 서버 저장 함수는 ko 본문", () => {
    expect(formatStoreOrderSummaryForChatMessage(ORDER, ITEMS).startsWith("📋 주문 요약")).toBe(true);
  });
});

describe("라벨 함수 — 언어 인자", () => {
  it("체크아웃 ETA", () => {
    const args = { checkout_eta_minutes: 25, checkout_route_distance_meters: 1500 };
    expect(HANGUL.test(formatStoreOrderCheckoutEtaSummary(args, "en") ?? "")).toBe(false);
    expect(formatStoreOrderCheckoutEtaSummary(args, "ko")).toBe("예상 배달 약 25분 · 경로 1.5km");
  });

  it("옵션 메모·이름 없는 옵션 그룹", () => {
    expect(orderLineOptionsSummary({ v: 2, line_note: "x" }, "en")).toBe("Note: x");
    expect(orderLineOptionsSummary({ v: 2, line_note: "x" }, "ko")).toBe("메모: x");
    const groups = parseProductOptionsJson([{ options: [{ name: "L" }] }], "en");
    expect(groups[0]?.label).toBe("Option 1");
  });

  it("주문 영수증 카드 대체 라벨", () => {
    const en = buildStoreOrderChatCardView({ order: {}, items: [{ price_snapshot: 1, qty: 1 }], language: "en" });
    expect(en.storeName).toBe("Store");
    expect(en.items[0]?.title).toBe("Item");
    const ko = buildStoreOrderChatCardView({ order: {}, language: "ko" });
    expect(ko.storeName).toBe("매장");
  });

  it("배달 채팅 보낸 사람 대체 라벨", () => {
    const base = { isDeliveryRoom: true, isMine: false, rawLabel: "a", storeDisplayName: "", buyerDisplayName: "" };
    expect(resolveDeliveryRoomMessageSenderLabel({ ...base, headerMode: "buyer_store", language: "en" })).toBe("Store");
    expect(resolveDeliveryRoomMessageSenderLabel({ ...base, headerMode: "owner_buyer_peer", language: "en" })).toBe(
      "Customer"
    );
    expect(resolveDeliveryRoomMessageSenderLabel({ ...base, headerMode: "owner_buyer_peer", language: "ko" })).toBe(
      "주문자"
    );
  });

  it("매장 주소 입력 키는 ko·en 모두 있다", () => {
    for (const key of [
      STORE_LOCATION_SECTION_HINT_STORE_PUBLIC_KEY,
      STORE_ADDRESS_STREET_LABEL_KEY,
      STORE_ADDRESS_STREET_HINT_KEY,
      STORE_ADDRESS_DETAIL_LABEL_KEY,
      STORE_ADDRESS_STREET_PLACEHOLDER_KEY,
    ]) {
      expect(HANGUL.test(translate("en", key))).toBe(false);
      expect(HANGUL.test(translate("ko", key))).toBe(true);
    }
  });
});

describe("사장님 상품 — 관리자 잠금 (서버 문장 없음)", () => {
  it("거부 응답에 문장이 없고 lock 만 있다", () => {
    const b = ownerProductStatusChangeBlock({ product_status: "hidden", admin_status_lock: "hidden" }, "active");
    expect(b?.error).toBe("admin_locked");
    expect(b?.lock).toBe("hidden");
    expect(b?.message).toBeUndefined();
  });

  it("코드 → 문구 (en 한글 0)", () => {
    const en = tFor("en");
    for (const code of ["admin_locked", "admin_blocked_product", "admin_review_rejected", "admin_review_pending"]) {
      const text = ownerProductStatusBlockText({ code, lock: "sold_out" }, en);
      expect(HANGUL.test(text)).toBe(false);
    }
    expect(ownerAdminLockLabel("blocked", en)).toBe("Admin action: sales blocked");
    expect(ownerAdminLockLabel("blocked", tFor("ko"))).toBe("관리자 판매 차단 조치");
  });

  it("모르는 문장은 내보내지 않는다", () => {
    const text = ownerProductStatusBlockText({ code: "서버 문장입니다" }, tFor("en"));
    expect(HANGUL.test(text)).toBe(false);
  });
});

describe("다시 주문 오류 코드", () => {
  it("코드 → 키, en 한글 0", () => {
    for (const code of Object.keys(REORDER_TO_CART_ERROR_KEYS)) {
      expect(HANGUL.test(reorderToCartErrorText(code, tFor("en")))).toBe(false);
    }
    expect(reorderToCartErrorText("no_items", tFor("ko"))).toBe("담을 메뉴가 없습니다.");
  });
});

describe("관리자 기본 거절 사유", () => {
  it("원장 최소값·옛 문장은 화면 사유에서 빠진다", () => {
    expect(isAdminDefaultRejectReason(ADMIN_REJECT_LEDGER_REASON_FALLBACK)).toBe(true);
    expect(storeOrderRejectReasonForDisplay("Refund request rejected by admin")).toBeNull();
    expect(storeOrderRejectReasonForDisplay("재고 없음")).toBe("재고 없음");
  });
});

describe("주문 매칭 응답", () => {
  it("저장 본문은 ko 호환, 화면은 보는 사람 언어", () => {
    expect(STORE_ORDER_MATCH_ACK_MESSAGE).toBe(translate("ko", "store_order_match_ack"));
    expect(isStoreOrderMatchAckText(translate("en", "store_order_match_ack"))).toBe(true);
    const en = localizeStoreOrderMatchAckText(STORE_ORDER_MATCH_ACK_MESSAGE, "en");
    expect(HANGUL.test(en)).toBe(false);
    expect(localizeStoreOrderMatchAckText("안녕하세요", "en")).toBe("안녕하세요");
  });
});
