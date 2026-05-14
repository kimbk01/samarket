import { haversineKm } from "@/lib/geo/haversine-km";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

/** WGS84 좌표가 유효하면 true */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return parseFiniteLatitude(lat) != null && parseFiniteLongitude(lng) != null;
}

/** 두 점 사이 직선거리(km). 좌표 불완전·범위 밖이면 null */
export function haversineDistanceKmBetween(
  a: { lat: unknown; lng: unknown } | null | undefined,
  b: { lat: unknown; lng: unknown } | null | undefined
): number | null {
  if (!a || !b) return null;
  const lat1 = parseFiniteLatitude(a.lat);
  const lng1 = parseFiniteLongitude(a.lng);
  const lat2 = parseFiniteLatitude(b.lat);
  const lng2 = parseFiniteLongitude(b.lng);
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  return haversineKm(lat1, lng1, lat2, lng2);
}

/** 소수 1자리 km 문자열 (단위 접미사 없음) — 표시 조합용 */
export function formatDistanceKmOneDecimal(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

/** 목록용: `약 1.2km` 또는 좌표/거리 없으면 `거리 정보 없음` */
export function formatApproxStraightDistanceListLabel(km: number | null | undefined): string {
  const inner = formatDistanceKmOneDecimal(km);
  if (!inner) return "거리 정보 없음";
  return `약 ${inner}`;
}
