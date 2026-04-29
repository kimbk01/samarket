/**
 * 거래 피드 카드 썸네일 규격 단일 소스.
 * - 중고거래/중고차/부동산/환전/일자리 전부 동일 크기
 * - 신규 거래 카테고리 추가 시에도 `PostCard`를 쓰면 자동으로 동일 규격을 따른다.
 */
export const TRADE_FEED_THUMB_BOX_CLASS =
  "relative h-[96px] w-[96px] shrink-0 flex-none self-start overflow-hidden rounded-[8px] bg-[#f2f3f5] [aspect-ratio:1/1] sm:h-[108px] sm:w-[108px] md:h-[120px] md:w-[120px]";
