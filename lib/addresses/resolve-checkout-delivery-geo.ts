import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";

export type ResolvedCheckoutDeliveryGeo = {
  regionId: string;
  cityId: string;
  summaryLine: string;
  detailLine: string;
};

/** 장바구니·POST /api/me/store-orders — `app_region_id`/`app_city_id` 없으면 주소 텍스트에서 추론 */
export function resolveCheckoutDeliveryGeoFromUserAddress(
  addr: UserAddressDTO
): ResolvedCheckoutDeliveryGeo | null {
  let regionId = addr.appRegionId?.trim() ?? "";
  let cityId = addr.appCityId?.trim() ?? "";
  if (!regionId || !cityId || !getLocationLabelIfValid(regionId, cityId)) {
    const inferred = inferAppLocationIdsFromUserAddress(addr);
    if (!inferred) return null;
    regionId = inferred.regionId;
    cityId = inferred.cityId;
  }

  const payload = toCheckoutDeliveryPayload({
    ...addr,
    appRegionId: regionId,
    appCityId: cityId,
  });
  const norm = normalizeStoreAddressPh({
    region: regionId,
    city: cityId,
    address1: payload.summary_line,
    address2: payload.address_detail,
  });
  if (!norm.region || !norm.city || !norm.address1) return null;

  return {
    regionId: norm.region,
    cityId: norm.city,
    summaryLine: norm.address1,
    detailLine: norm.address2 ?? "",
  };
}

export function isCheckoutDeliveryGeoReady(geo: ResolvedCheckoutDeliveryGeo | null): boolean {
  if (!geo) return false;
  return (
    geo.summaryLine.trim().length >= 3 &&
    Boolean(getLocationLabelIfValid(geo.regionId, geo.cityId))
  );
}
