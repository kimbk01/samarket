import { getLocationLabelIfValid } from "@/lib/products/form-options";
import { matchRegionCityFromFullAddress } from "@/lib/profile/match-region-from-full-address";
import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";

/**
 * 거래 글쓰기 `region`/`city`(앱 내부 ID)과 **거래 희망 장소**(`tradeMeetSpot`) 관계 — 단일 규약.
 *
 * 1. **내정보 주소록(대표·거래용)**  
 *    `TradeDefaultLocationBlock`이 스냅샷을 불러와 `onSyncRegionCity`로 폼의 `region`/`city`를 맞춘다.  
 *    단, 지도에서 한 줄(`tradeMeetSpot.displayLine`)이 이미 있으면  
 *    `suppressAddressBookRegionSync`로 주소록이 핀/역지오 결과를 덮어쓰지 않는다.
 *
 * 2. **거래 장소(지도)**  
 *    확인 시 세션 `TradeMeetSpotPickResult`에 `displayLine`(+ 좌표 등)과 가능하면 `appRegionId`/`appCityId`를 싣는다.  
 *    폼에서는 `applyMeetSpotPick`으로 spot을 넣고, 아래 추론으로 ID를 맞춘다.
 *
 * 3. **검증·저장에 쓰는 값**  
 *    `effectiveRegion = region`이 비어 있지 않으면 그대로, 아니면 **이 함수**로 spot에서 추론한 ID.  
 *    (`TradeWriteForm` / `ExchangeWriteForm` / `JobsWriteForm` 동일 패턴)
 *
 * 4. **추론 순서**  
 *    - `appRegionId`·`appCityId`가 있고 **REGIONS에 유효한 쌍**이면 그대로 사용.  
 *      (레거시·오염된 세션 값은 무시하고 표시 줄 매칭으로 넘어감)
 *    - 아니면 `displayLine`을 `matchRegionCityFromFullAddress`에 넘긴다  
 *      (권역명 없는 POI 한 줄·`City – Subarea` 카탈로그의 앞부분만 있는 주소 등 포함).
 *
 * 5. **서버**  
 *    `createPost` 등은 `region`/`city`를 **클라이언트가 준 ID 문자열을 그대로 저장**한다.  
 *    표시 줄과의 정합은 클라이언트 검증에 의존한다.
 */
export function inferTradeRegionCityFromMeetSpot(
  spot: TradeMeetSpotValue | null | undefined
): { regionId: string; cityId: string } | null {
  if (!spot?.displayLine?.trim()) return null;
  const rid = spot.appRegionId?.trim();
  const cid = spot.appCityId?.trim();
  if (rid && cid && getLocationLabelIfValid(rid, cid)) {
    return { regionId: rid, cityId: cid };
  }
  return matchRegionCityFromFullAddress(spot.displayLine);
}
