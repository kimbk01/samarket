import { describe, expect, it } from "vitest";
import {
  computeStoreCartAddOrMerge,
  emptyCommerceCartV2,
} from "@/lib/stores/store-commerce-cart-add-merge";
import { computeStoreCheckoutPayable } from "@/lib/stores/store-checkout-payable";
import {
  buildStoreCheckoutOrderSummaryLabel,
  buildStoreCheckoutRequestLabel,
} from "@/lib/stores/store-checkout-confirm-labels";
import {
  resolveStoreCartLineIssueMessage,
  resolveStoreCheckoutClientError,
} from "@/lib/stores/resolve-store-checkout-client-error";
import { resolveStoreReportSubmitErrorKey } from "@/lib/stores/store-report-form-errors";
import type { StoreCouponQuote } from "@/lib/stores/store-coupon-best-eligible";
import type { CheckoutEligibleGift } from "@/lib/gift-certificate/checkout-eligible-gifts";
import type { AddStoreCartLineInput } from "@/lib/stores/store-commerce-cart-types";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const sheetLine: AddStoreCartLineInput = {
  storeId: "store-a",
  storeSlug: "a",
  storeName: "A",
  productId: "p1",
  title: "Burger",
  thumbnailUrl: null,
  qty: 3,
  unitPricePhp: 130,
  optionSelections: { size: ["L"] },
  modifierWire: { pick: { size: ["L"] }, qty: {} },
  optionsSummary: "L",
  lineNote: "no onion",
  pickupAvailable: true,
  localDeliveryAvailable: true,
  shippingAvailable: false,
  minOrderQty: 1,
  maxOrderQty: 5,
};

describe("CRT-03 메뉴 카드 퀵 추가(+) = 누적, 메모·옵션 유지", () => {
  it("increment: 기존 qty 3 + 1 → 4, 메모·옵션·단가 유지", () => {
    const first = computeStoreCartAddOrMerge(emptyCommerceCartV2(), sheetLine);
    const quick = computeStoreCartAddOrMerge(first.nextSnapshot!, {
      ...sheetLine,
      qty: 1,
      unitPricePhp: 120,
      optionSelections: {},
      modifierWire: { pick: {}, qty: {} },
      optionsSummary: "",
      lineNote: null,
      mergeQtyMode: "increment",
    });
    expect(quick.result).toEqual({ ok: true, reason: "merged" });
    const lines = quick.nextSnapshot!.carts["store-a"]!.lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      lineId: first.nextSnapshot!.carts["store-a"]!.lines[0]!.lineId,
      qty: 4,
      lineNote: "no onion",
      optionsSummary: "L",
      unitPricePhp: 130,
      modifierWire: { pick: { size: ["L"] }, qty: {} },
    });
  });

  it("increment 는 최대 수량을 넘지 않는다", () => {
    const first = computeStoreCartAddOrMerge(emptyCommerceCartV2(), { ...sheetLine, qty: 5 });
    const quick = computeStoreCartAddOrMerge(first.nextSnapshot!, {
      ...sheetLine,
      qty: 1,
      mergeQtyMode: "increment",
    });
    expect(quick.nextSnapshot!.carts["store-a"]!.lines[0]!.qty).toBe(5);
  });

  it("기본 set(시트 확정)은 기존처럼 선택값으로 교체", () => {
    const first = computeStoreCartAddOrMerge(emptyCommerceCartV2(), sheetLine);
    const again = computeStoreCartAddOrMerge(first.nextSnapshot!, { ...sheetLine, qty: 2, lineNote: null });
    expect(again.nextSnapshot!.carts["store-a"]!.lines[0]).toMatchObject({ qty: 2, lineNote: null });
  });
});

function quote(over: Partial<StoreCouponQuote> = {}): StoreCouponQuote {
  return {
    userCouponId: "uc1",
    campaignId: "c1",
    title: "Coupon",
    couponNumber: null,
    discountAmount: 100,
    fundingMode: "STORE_FUNDED",
    ineligibleReason: null,
    ...over,
  };
}

function gift(remaining: number): CheckoutEligibleGift {
  return {
    instanceId: "g1",
    publicGiftNumber: "G-1",
    giftScope: "STORE",
    storeId: "store-a",
    storeName: "A",
    title: "Gift",
    imageUrl: null,
    faceValue: remaining,
    remainingBalance: remaining,
    status: "ACTIVE",
  } as CheckoutEligibleGift;
}

describe("CRT-05 결제 예정액 (푸터·확인창 공통) 사례표", () => {
  const cases: {
    name: string;
    gross: number;
    coupon: StoreCouponQuote | null;
    gift: CheckoutEligibleGift | null;
    payable: number;
  }[] = [
    { name: "상품 500 + 배달비 50", gross: 550, coupon: null, gift: null, payable: 550 },
    { name: "+ 쿠폰 100", gross: 550, coupon: quote(), gift: null, payable: 450 },
    { name: "+ 쿠폰 100 + 상품권 200", gross: 550, coupon: quote(), gift: gift(200), payable: 250 },
    { name: "상품권이 잔액보다 큼 → 0", gross: 550, coupon: quote(), gift: gift(1000), payable: 0 },
    {
      name: "사용 불가 쿠폰은 빼지 않음",
      gross: 550,
      coupon: quote({ ineligibleReason: "coupon_min_order" }),
      gift: null,
      payable: 550,
    },
    { name: "픽업(배달비 없음) + 쿠폰", gross: 500, coupon: quote(), gift: null, payable: 400 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const r = computeStoreCheckoutPayable({
        grossPhp: c.gross,
        couponQuotes: c.coupon ? [c.coupon] : [],
        appliedUserCouponId: c.coupon ? c.coupon.userCouponId : null,
        eligibleGifts: c.gift ? [c.gift] : [],
        appliedGiftInstanceId: c.gift ? c.gift.instanceId : null,
      });
      expect(r.payablePhp).toBe(c.payable);
    });
  }

  it("확인창 문구는 i18n 키 + 결제 예정액", () => {
    const label = buildStoreCheckoutOrderSummaryLabel(
      [
        { title: "Burger", qty: 2 },
        { title: "Fries", qty: 1 },
      ],
      450,
      t as never
    );
    expect(label).toContain('store_checkout_summary_name_more:{"title":"Burger","count":1}');
    expect(label).toContain("store_checkout_summary_total:");
    expect(label).toContain('"count":3');
    expect(label).toContain("450");
    expect(label).not.toMatch(/[가-힣]/);
    expect(buildStoreCheckoutOrderSummaryLabel([], 0, t as never)).toBe("store_checkout_summary_none");
    expect(buildStoreCheckoutRequestLabel("  ", t as never)).toBe("store_checkout_request_none");
  });
});

describe("CRT-02·CRT-10 오류 코드 → i18n (원래 코드 노출 없음)", () => {
  it.each([
    ["product_sold_out", "store_err_sold_out_in_cart"],
    ["product_not_available", "store_err_product_stopped_in_cart"],
    ["options_too_few", "store_err_required_option_changed_cart"],
    ["options_sold_out", "store_err_option_sold_out_cart"],
    ["options_invalid_choice", "store_err_options_changed_cart"],
    ["qty_out_of_range", "store_err_qty_out_of_range_cart"],
    ["owner_self_order_denied", "store_err_own_store_block"],
    ["buyer_phone_required", "store_err_buyer_phone_required"],
    ["invalid_buyer_phone", "store_err_invalid_buyer_phone"],
    ["duplicate_line_in_order", "store_err_duplicate_line"],
    ["pickup_not_available", "store_err_pickup_item_not_available"],
  ])("%s", (code, key) => {
    expect(resolveStoreCheckoutClientError(t as never, code)).toBe(key);
  });

  it("서버가 product_id 를 주면 상품명을 붙인다", () => {
    expect(
      resolveStoreCheckoutClientError(t as never, "product_sold_out", { itemTitle: "Fries" })
    ).toBe('store_err_line_item_prefix:{"item":"Fries","message":"store_err_sold_out_in_cart"}');
  });

  it("카트 줄 사유 문구 — 모르는 코드는 판매 중지 문구", () => {
    expect(resolveStoreCartLineIssueMessage(t as never, "product_sold_out")).toBe(
      "store_err_sold_out_in_cart"
    );
    expect(resolveStoreCartLineIssueMessage(t as never, "weird")).toBe(
      "store_err_product_stopped_in_cart"
    );
  });

  it("신고 오류 코드 → i18n 키", () => {
    expect(resolveStoreReportSubmitErrorKey("product_not_active")).toBe(
      "store_report_err_product_not_reportable"
    );
    expect(resolveStoreReportSubmitErrorKey("product_store_mismatch")).toBe(
      "store_report_err_product_not_reportable"
    );
    expect(resolveStoreReportSubmitErrorKey("report_recent_duplicate")).toBe("store_report_err_duplicate");
    expect(resolveStoreReportSubmitErrorKey("report_rate_limited")).toBe("store_report_err_rate_limited");
    expect(resolveStoreReportSubmitErrorKey("store_reports_table_missing")).toBe("store_report_err_failed");
    expect(resolveStoreReportSubmitErrorKey(undefined)).toBe("store_report_err_failed");
  });
});
