/**
 * 회원 피드 배너 상품 이름 단일 정의 (광고 감사 FB-07 · 2026-11-26).
 *
 * - 이름 = 종류 키 + DB 기간(`feed_ad_products.duration_days`). DB `title_ko/en`(「거래 피드 광고 3일」)은 화면에 쓰지 않는다 —
 *   어드민 화면에 제목 입력칸이 없어 기간을 바꾸면 옛 기간 이름이 남았다.
 * - 회원 연장 창 · 어드민 배너 가격 화면 · 어드민 상품 모델이 이 함수만 쓴다.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

export function feedAdProductTitleKey(domain: string | null | undefined): MessageKey {
  return domain === "community" ? "feed_ad_product_title_community" : "feed_ad_product_title_trade";
}

/** React 밖(서버·모델)용 — 화면에서는 `t(feedAdProductTitleKey(domain), { days })` */
export function feedAdProductTitle(
  lang: string | null | undefined,
  product: { domain: string | null | undefined; durationDays: number }
): string {
  return translateBy(lang, feedAdProductTitleKey(product.domain), {
    days: Math.max(0, Math.floor(Number(product.durationDays) || 0)),
  });
}
