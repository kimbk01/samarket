import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildTradePublicLine } from "@/lib/addresses/user-address-format";
import {
  getLocationLabelIfValid,
  parseLocationLabelToIds,
  REGIONS,
} from "@/lib/products/form-options";
import { lookupLocationByPhilippinesZip } from "@/lib/products/zip-to-location";

/**
 * `app_region_id` / `app_city_id` 가 비어 있어도, 우편·주소 한 줄·시/바랑가이 텍스트로
 * 글쓰기·피드용 region/city id 를 추론합니다.
 */
export function inferAppLocationIdsFromUserAddress(a: UserAddressDTO): {
  regionId: string;
  cityId: string;
} | null {
  const rid0 = a.appRegionId?.trim() ?? "";
  const cid0 = a.appCityId?.trim() ?? "";
  if (rid0 && cid0 && getLocationLabelIfValid(rid0, cid0)) {
    return { regionId: rid0, cityId: cid0 };
  }

  const nn = a.neighborhoodName?.trim();
  if (nn?.includes("·")) {
    const p = parseLocationLabelToIds(nn);
    if (p && getLocationLabelIfValid(p.regionId, p.cityId)) return p;
  }

  const full = a.fullAddress?.trim() ?? "";
  const zipMatch = full.match(/\b([0-9]{4})\b/);
  if (zipMatch) {
    const hit = lookupLocationByPhilippinesZip(zipMatch[1]);
    if (hit && getLocationLabelIfValid(hit.regionId, hit.cityId)) return hit;
  }

  const publicLine = buildTradePublicLine(a);
  const fromLine = matchFromCommaLocationLine(publicLine);
  if (fromLine) return fromLine;

  return matchFromStructuredFields(a);
}

/** `buildTradePublicLine` 결과(예: Quiapo, Manila / 170 Commonwealth Ave, Quezon City) */
function matchFromCommaLocationLine(line: string): { regionId: string; cityId: string } | null {
  const parts = line
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const parent = parts[parts.length - 1];
  const area = parts[parts.length - 2];
  const pl = parent.toLowerCase();
  const al = area.toLowerCase();

  for (const region of REGIONS) {
    const rn = region.name.toLowerCase();
    const regionOk = pl === rn || pl.includes(rn) || rn.includes(pl);
    if (!regionOk) continue;
    for (const city of region.cities) {
      const cn = city.name.toLowerCase();
      if (al === cn || al.includes(cn) || cn.includes(al)) {
        return { regionId: region.id, cityId: city.id };
      }
    }
  }

  return null;
}

function matchFromStructuredFields(a: UserAddressDTO): { regionId: string; cityId: string } | null {
  const cm = a.cityMunicipality?.trim().toLowerCase() ?? "";
  const bg = (a.barangay?.trim() || a.district?.trim() || a.streetAddress?.trim() || "").toLowerCase();
  if (!cm) return null;

  if (!bg) return null;

  for (const region of REGIONS) {
    const rn = region.name.toLowerCase();
    if (cm !== rn && !cm.includes(rn) && !rn.includes(cm)) continue;
    for (const city of region.cities) {
      const cn = city.name.toLowerCase();
      if (bg.includes(cn) || cn.includes(bg)) {
        return { regionId: region.id, cityId: city.id };
      }
    }
  }
  return null;
}
