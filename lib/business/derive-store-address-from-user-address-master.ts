import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { formatUserAddressFull } from "@/lib/addresses/user-address-display-ssot";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { REGIONS } from "@/lib/products/form-options";

export type DerivedStoreAddressFromMaster = {
  regionId: string;
  cityId: string;
  regionName: string;
  cityName: string;
  addressStreetLine: string;
  addressDetail: string;
};

function stripTail(line: string, parts: Array<string | null | undefined>) {
  let s = line.trim();
  const uniq = parts
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  for (const token of uniq) {
    const re = new RegExp(String.raw`(?:,\s*|\s+)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*$`, "i");
    while (re.test(s)) s = s.replace(re, "").trim();
  }
  return s.trim();
}

/**
 * 주소록 `UserAddressDTO` → 매장 기본 정보에 쓰는 지역 ID·이름·가로/상세 줄.
 * (과거 이름 `…FromUserAddressMaster` — 대표 전용이 아니라 **매장 연결 주소**에도 동일 규칙 적용)
 */
export function deriveStoreAddressFieldsFromUserAddressMaster(
  master: UserAddressDTO | null | undefined
): DerivedStoreAddressFromMaster | null {
  if (!master?.id) return null;
  const inferred = inferAppLocationIdsFromUserAddress(master);
  if (!inferred?.regionId || !inferred?.cityId) return null;
  const r = REGIONS.find((x) => x.id === inferred.regionId);
  const c = r?.cities.find((x) => x.id === inferred.cityId);
  if (!r || !c) return null;

  const streetRaw =
    formatUserAddressFull(master) ||
    (master.fullAddress ?? "").trim() ||
    (master.streetAddress ?? "").trim() ||
    "";
  const streetNoCountry = stripCountryFromAddressDisplayLine(streetRaw, master.countryName).trim();
  const summary = stripTail(streetNoCountry, [c.name, r.name]).trim();
  const unit = [master.unitFloorRoom, master.buildingName]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const landmark = (master.landmark ?? "").trim();
  const detail = [unit, landmark ? `Landmark: ${landmark}` : ""].filter(Boolean).join("\n").trim();

  return {
    regionId: inferred.regionId,
    cityId: inferred.cityId,
    regionName: r.name,
    cityName: c.name,
    addressStreetLine: summary,
    addressDetail: detail,
  };
}
