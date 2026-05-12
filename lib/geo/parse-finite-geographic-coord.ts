/**
 * DB/API에서 온 위도·경도 값 파싱.
 * `null` / `undefined` / 빈 문자열은 누락으로 처리해 **`Number(null) === 0`** 오인을 막는다.
 */
export function parseFiniteGeographicCoord(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function parseFiniteLatitude(value: unknown): number | null {
  const n = parseFiniteGeographicCoord(value);
  if (n == null) return null;
  if (n < -90 || n > 90) return null;
  return n;
}

export function parseFiniteLongitude(value: unknown): number | null {
  const n = parseFiniteGeographicCoord(value);
  if (n == null) return null;
  if (n < -180 || n > 180) return null;
  return n;
}
