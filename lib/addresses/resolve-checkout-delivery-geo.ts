import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";

export type ResolvedCheckoutDeliveryGeo = {
  /** 앱 동네 목록 ID — 목록 밖 지역이면 빈 값(시/군 LGU 로 대신 확정) */
  regionId: string;
  cityId: string;
  /** 시/군 PSGC — 배달 주소 기준 (H5 2026-11-09) */
  lguId: string;
  summaryLine: string;
  detailLine: string;
};

/** 장바구니·POST /api/me/store-orders — `app_region_id`/`app_city_id` 없으면 주소 텍스트에서 추론 */
export function resolveCheckoutDeliveryGeoFromUserAddress(
  addr: UserAddressDTO
): ResolvedCheckoutDeliveryGeo | null {
  let regionId = addr.appRegionId?.trim() ?? "";
  let cityId = addr.appCityId?.trim() ?? "";
  const lguId = (addr.canonicalLguId ?? "").trim();
  if (!regionId || !cityId || !getLocationLabelIfValid(regionId, cityId)) {
    const inferred = inferAppLocationIdsFromUserAddress(addr);
    /**
     * H5 (2026-11-09): 앱 동네 목록(4개 도시권 143곳) 밖 주소도 시/군 LGU 가 있으면 배달 주문 가능.
     * 이전: 목록에 없으면 결제 불가(Bacoor·「Quezon City, Metro Manila」처럼 시만 있는 주소 등).
     */
    if (!inferred && !lguId) return null;
    regionId = inferred?.regionId ?? "";
    cityId = inferred?.cityId ?? "";
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
  if (!norm.address1) return null;
  if ((!norm.region || !norm.city) && !lguId) return null;

  return {
    regionId: norm.region ?? "",
    cityId: norm.city ?? "",
    lguId,
    summaryLine: norm.address1,
    detailLine: norm.address2 ?? "",
  };
}

export function isCheckoutDeliveryGeoReady(geo: ResolvedCheckoutDeliveryGeo | null): boolean {
  if (!geo) return false;
  return (
    geo.summaryLine.trim().length >= 3 &&
    (Boolean(getLocationLabelIfValid(geo.regionId, geo.cityId)) || Boolean(geo.lguId.trim()))
  );
}
