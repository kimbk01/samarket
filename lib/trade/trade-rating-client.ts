/**
 * 거래 평가 — 화면·서버 공용 순수 정의 (CREW REP S5). 서버 전용 모듈을 가져오지 않는다.
 */
import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
  SELLER_TO_BUYER_NEGATIVE,
  SELLER_TO_BUYER_POSITIVE,
} from "@/lib/trade/trade-review-tags";

export type TradeRatingType = "good" | "normal" | "bad";
export type TradeHappened = "yes" | "chat_only";
export type TradeRatingRole = "buyer_to_seller" | "seller_to_buyer";

/** 고를 수 있는 태그 — 좋아요·보통은 좋은 태그, 아쉬워요는 아쉬운 태그 */
export function allowedTagKeys(role: TradeRatingRole, type: TradeRatingType): string[] {
  const pos = role === "buyer_to_seller" ? BUYER_TO_SELLER_POSITIVE : SELLER_TO_BUYER_POSITIVE;
  const neg = role === "buyer_to_seller" ? BUYER_TO_SELLER_NEGATIVE : SELLER_TO_BUYER_NEGATIVE;
  return (type === "bad" ? neg : pos).map((x) => x.key);
}
