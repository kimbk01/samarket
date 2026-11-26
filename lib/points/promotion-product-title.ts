/**
 * 상위노출 상품 이름 단일 정의 (광고 프로세스 감사 TB-02 · 2026-11-26).
 *
 * - 이름 = 종류 키 + DB 기간(`member_promotion_products.duration_days`).
 * - 코드·DB 에 「7일」 같은 숫자를 박은 이름을 두지 않는다 — 어드민이 기간을 바꾸면 이름도 같이 바뀐다.
 * - 회원 결제 창·포인트 신청 폼·어드민 가격 화면·어드민 상품 모델이 모두 이 함수만 쓴다.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MemberPromotionDomain } from "@/lib/points/promotion-products";

export function memberPromotionProductTitleKey(domain: MemberPromotionDomain | string | null | undefined): MessageKey {
  return domain === "community" ? "promo_product_title_community" : "promo_product_title_trade";
}

/** React 밖(서버·모델)용 — 화면에서는 `t(memberPromotionProductTitleKey(domain), { days })` */
export function memberPromotionProductTitle(
  lang: string | null | undefined,
  product: { domain: MemberPromotionDomain | string | null | undefined; durationDays: number }
): string {
  return translateBy(lang, memberPromotionProductTitleKey(product.domain), {
    days: Math.max(0, Math.floor(Number(product.durationDays) || 0)),
  });
}
