/** 거래 글 `meta.trade_meet_spot` 및 위치 선택 플로우 */

export type TradeMeetSpotValue = {
  /** 지도·역지오코딩 또는 사용자 정리 한 줄 */
  displayLine: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};
