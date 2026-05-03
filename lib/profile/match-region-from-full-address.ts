import { REGIONS } from "@/lib/products/form-options";

/**
 * 역지오코딩·POI 한 줄과 카탈로그 비교용 — 결합 발음부호 제거·소문자·공백 정리.
 * (예: Parañaque / Paranaque 동일 취급)
 */
function normalizeForLocationMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 카탈로그 도시명 → 부분 문자열 매칭용 키.
 * - 전체 명칭 (예: `Taguig – BGC`)
 * - ` – ` / ` - ` 앞 선행 지명만 (예: `Parañaque – BF Homes` → `Parañaque`)
 *   Google 주소가 `..., Parañaque`처럼 구만 줄 때 필수.
 */
function catalogCityMatchKeys(catalogCityName: string): string[] {
  const raw = catalogCityName.trim();
  if (!raw) return [];
  const keys = new Set<string>();
  keys.add(normalizeForLocationMatch(raw));

  const enSplit = raw.split(" – ");
  if (enSplit[0]?.trim()) keys.add(normalizeForLocationMatch(enSplit[0].trim()));

  const hySplit = raw.split(/\s-\s/);
  if (hySplit.length >= 2 && hySplit[0]?.trim()) {
    keys.add(normalizeForLocationMatch(hySplit[0].trim()));
  }

  return [...keys].filter(Boolean);
}

/** 주소 한 줄에 권역명(예: Manila, Quezon City)이 있을 때 — 도시만 맞는 후보보다 우선 */
const SCORE_REGION_NAME_IN_LINE = 5_000_000;
/** 카탈로그 도시 한 줄이 주소에 그대로 포함 */
const SCORE_FULL_CATALOG_CITY_IN_LINE = 1_000_000;

/**
 * POI·역지오코딩 문자열에 권역명이 없을 때 — 너무 짧은 토큰으로 오매칭 방지 (예: "San")
 */
const MIN_KEY_LENGTH_WHEN_REGION_NAME_ABSENT = 5;

/**
 * Google 역지오코딩 문자열에서 앱 `REGIONS` 목록과 대응되는 region·city ID를 추정한다.
 * - 권역명이 한 줄에 있으면 해당 권역 후보에 가산점
 * - 권역명이 없어도 **도시/구 키**(카탈로그 도시명·`X – Y`의 X)만으로 매칭 — `Medley Buffet Parañaque` 등
 * - 도시명이 긴 항목을 우선(부분 문자열 충돌 완화)
 */
export function matchRegionCityFromFullAddress(fullAddress: string): { regionId: string; cityId: string } | null {
  const norm = normalizeForLocationMatch(fullAddress);
  if (!norm) return null;

  type Hit = { regionId: string; cityId: string; score: number };
  const hits: Hit[] = [];

  for (const r of REGIONS) {
    const rn = normalizeForLocationMatch(r.name);
    const regionNameInNorm = Boolean(rn && norm.includes(rn));

    const citiesSorted = [...r.cities].sort((a, b) => b.name.length - a.name.length);

    for (const c of citiesSorted) {
      const fullCityNorm = normalizeForLocationMatch(c.name);
      const keys = catalogCityMatchKeys(c.name);
      let bestKeyLen = 0;
      let matchedFullCatalog = false;

      for (const k of keys) {
        if (!k || !norm.includes(k)) continue;
        if (!regionNameInNorm && k.length < MIN_KEY_LENGTH_WHEN_REGION_NAME_ABSENT) continue;
        bestKeyLen = Math.max(bestKeyLen, k.length);
      }
      if (bestKeyLen === 0) continue;
      if (fullCityNorm && norm.includes(fullCityNorm)) matchedFullCatalog = true;

      const score =
        (regionNameInNorm ? SCORE_REGION_NAME_IN_LINE : 0) +
        (matchedFullCatalog ? SCORE_FULL_CATALOG_CITY_IN_LINE : 0) +
        bestKeyLen * 10_000 +
        fullCityNorm.length;

      hits.push({ regionId: r.id, cityId: c.id, score });
    }
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => b.score - a.score);
  return { regionId: hits[0].regionId, cityId: hits[0].cityId };
}
