import {
  computeCheckoutGiftApplyPreview,
  type CheckoutEligibleGift,
} from "@/lib/gift-certificate/checkout-eligible-gifts";
import {
  isUsableStoreCouponQuote,
  type StoreCouponQuote,
} from "@/lib/stores/store-coupon-best-eligible";

export type StoreCheckoutPayable = {
  couponDiscountPhp: number;
  /** 쿠폰 반영 후·상품권 전 (서버 `amount_before_gift` 표시 대응) */
  amountBeforeGiftPhp: number;
  giftUsedPhp: number;
  /** 1회 전액 소진 정책(GFT-04)으로 이 주문에서 사라지는 상품권 잔액 — 주문 확인창 동의 표시용 */
  giftForfeitedPhp: number;
  /** 결제 예정액 — 장바구니 푸터·주문 확인창 공통 */
  payablePhp: number;
};

/**
 * CRT-05 — 장바구니 결제 예정액 단일 계산(표시용). 서버 청구 = amount_before_gift − gift 와 같은 순서.
 * grossPhp = 상품 합계(+배달비, 배달일 때).
 */
export function computeStoreCheckoutPayable(args: {
  grossPhp: number;
  couponQuotes: readonly StoreCouponQuote[];
  appliedUserCouponId: string | null;
  eligibleGifts: readonly CheckoutEligibleGift[];
  appliedGiftInstanceId: string | null;
}): StoreCheckoutPayable {
  const quote = args.couponQuotes.find((q) => q.userCouponId === args.appliedUserCouponId);
  const couponDiscountPhp = quote && isUsableStoreCouponQuote(quote) ? quote.discountAmount : 0;
  const amountBeforeGiftPhp = args.grossPhp - couponDiscountPhp;
  const gift = args.eligibleGifts.find((g) => g.instanceId === args.appliedGiftInstanceId) ?? null;
  const giftPreview = gift
    ? computeCheckoutGiftApplyPreview({
        amountBeforeGift: amountBeforeGiftPhp,
        giftRemaining: gift.remainingBalance,
      })
    : null;
  const giftUsedPhp = giftPreview ? giftPreview.giftUsed : 0;
  return {
    couponDiscountPhp,
    amountBeforeGiftPhp,
    giftUsedPhp,
    giftForfeitedPhp: giftPreview ? giftPreview.giftForfeited : 0,
    payablePhp: Math.max(0, amountBeforeGiftPhp - giftUsedPhp),
  };
}
