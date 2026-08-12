import { getLocationLabelIfValid } from "@/lib/products/form-options";
import { mapAddressLineToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";

/**
 * 거래 글쓰기 `region`/`city`(앱 내부 ID)과 **거래 희망 장소**(`tradeMeetSpot`) 관계 — 단일 규약.
 *
 * Taxonomy authority: `mapAddressLineToAppLocation` / `mapUserAddressToAppLocation`
 * (same mapper as address book → trade region).
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
  return mapAddressLineToAppLocation(spot.displayLine);
}
