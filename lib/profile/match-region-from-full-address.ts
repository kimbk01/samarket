import { REGIONS } from "@/lib/products/form-options";

/**
 * Google 역지오코딩 문자열에서 앱 `REGIONS` 목록과 대응되는 region·city ID를 추정한다.
 * - 도시명이 긴 항목을 우선(부분 문자열 충돌 완화)
 * - 매칭 실패 시 null → 거래 동네(RegionContext)는 목록 매칭 없이 비활성일 수 있음
 */
export function matchRegionCityFromFullAddress(fullAddress: string): { regionId: string; cityId: string } | null {
  const norm = fullAddress.toLowerCase().replace(/\s+/g, " ").trim();
  if (!norm) return null;

  type Hit = { regionId: string; cityId: string; score: number };
  const hits: Hit[] = [];

  for (const r of REGIONS) {
    const rn = r.name.toLowerCase();
    if (!norm.includes(rn)) continue;
    const citiesSorted = [...r.cities].sort((a, b) => b.name.length - a.name.length);
    for (const c of citiesSorted) {
      const cn = c.name.toLowerCase();
      if (norm.includes(cn)) {
        hits.push({ regionId: r.id, cityId: c.id, score: rn.length + cn.length });
      }
    }
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => b.score - a.score);
  return { regionId: hits[0].regionId, cityId: hits[0].cityId };
}
