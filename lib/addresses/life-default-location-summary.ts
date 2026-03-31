import { REGIONS, getLocationLabelIfValid } from "@/lib/products/form-options";

function isValidRegionCity(regionId: string, cityId: string): boolean {
  const r = REGIONS.find((x) => x.id === regionId);
  return !!r?.cities.some((c) => c.id === cityId);
}

/** `/api/me/address-defaults`·마이페이지 동네 표시 공통 */
export type LifeDefaultLocationSummary = {
  /** 앱 지역·동네(app_region_id + app_city_id)가 목록과 일치 */
  complete: boolean;
  /** 한 줄 표시(완전하면 라벨, 아니면 동네명·광역만 등) */
  label: string;
};

export function summarizeLifeDefaultAppLocation(
  life:
    | {
        appRegionId?: string | null;
        appCityId?: string | null;
        neighborhoodName?: string | null;
      }
    | null
    | undefined
): LifeDefaultLocationSummary {
  if (!life) return { complete: false, label: "" };
  const rid = (life.appRegionId ?? "").trim();
  const cid = (life.appCityId ?? "").trim();
  const nn = (life.neighborhoodName ?? "").trim();
  if (rid && cid && isValidRegionCity(rid, cid)) {
    const lbl = getLocationLabelIfValid(rid, cid);
    if (lbl) return { complete: true, label: lbl };
  }
  if (nn) return { complete: false, label: nn };
  if (rid) {
    const r = REGIONS.find((x) => x.id === rid);
    if (r?.name) return { complete: false, label: r.name };
  }
  return { complete: false, label: "" };
}
