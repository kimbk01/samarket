/**
 * DELIVERY_ROUTABLE — Delivery discovery / serviceability만의 좌표 가능 계약.
 *
 * ADDRESS_COMPLETE (`canonical-default-address`) 와 분리:
 * - ADDRESS_COMPLETE = active master row 존재
 * - DELIVERY_ROUTABLE = 그 master가 Delivery origin으로 쓸 수 있는 valid lat/lng
 *
 * Community / Market / MandatoryAddressGate 는 ADDRESS_COMPLETE 를 유지한다.
 */

import { isValidLatLng } from "@/lib/geo/haversine-distance";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

/**
 * Delivery origin 좌표 — 기존 WGS84 parser (`parseFiniteLatitude` / `Longitude`) 재사용.
 * Null Island (0,0) 은 Delivery 배송 기준에서 거부 (국가 bounds 신설 아님).
 */
export function isDeliveryRoutableCoords(lat: unknown, lng: unknown): boolean {
  if (!isValidLatLng(lat, lng)) return false;
  const a = parseFiniteLatitude(lat);
  const b = parseFiniteLongitude(lng);
  if (a == null || b == null) return false;
  if (a === 0 && b === 0) return false;
  return true;
}

export type DeliveryRoutableAddressLike = {
  id?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  isActive?: boolean;
};

/** active master row + valid id + Delivery-routable lat/lng */
export function isDeliveryRoutableMasterAddress(
  row: DeliveryRoutableAddressLike | null | undefined,
): boolean {
  if (!row) return false;
  if (row.isActive === false) return false;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return false;
  return isDeliveryRoutableCoords(row.latitude, row.longitude);
}
