/** 두 좌표 간 거리(km). 좌표 없으면 null */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number | null | undefined,
  lng2: number | null | undefined
): number | null {
  if (lat2 == null || lng2 == null) return null;
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** district 문자열 일치 점수 (낮을수록 우선): 0=동일, 1=부분일치, 2=미일치/없음 */
export function districtRank(storeDistrict: string | null, filterDistrict: string | null): number {
  if (!filterDistrict?.trim()) return 0;
  const f = filterDistrict.trim().toLowerCase();
  const s = (storeDistrict ?? "").trim().toLowerCase();
  if (!s) return 2;
  if (s === f) return 0;
  if (s.includes(f) || f.includes(s)) return 1;
  return 2;
}
