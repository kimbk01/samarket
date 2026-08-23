/**
 * CUT 3 — district tier for shadow ranking.
 * Semantics MUST match `districtRank` (lib/geo/haversine-km.ts).
 * district_norm is accelerator only — authority remains lower(trim(district)).
 */

export function shadowDistrictTier(
  storeDistrict: string | null | undefined,
  filterDistrict: string | null | undefined
): number {
  if (!filterDistrict?.trim()) return 0;
  const f = filterDistrict.trim().toLowerCase();
  const s = (storeDistrict ?? "").trim().toLowerCase();
  if (!s) return 2;
  if (s === f) return 0;
  if (s.includes(f) || f.includes(s)) return 1;
  return 2;
}

export function shadowDistrictTierFromNorm(
  storeDistrictNorm: string | null | undefined,
  filterDistrict: string | null | undefined
): number {
  if (!filterDistrict?.trim()) return 0;
  const f = filterDistrict.trim().toLowerCase();
  const s = (storeDistrictNorm ?? "").trim().toLowerCase();
  if (!s) return 2;
  if (s === f) return 0;
  if (s.includes(f) || f.includes(s)) return 1;
  return 2;
}
