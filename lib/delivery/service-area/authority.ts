/**
 * Per-store delivery service-area authority mode (V2 store-by-store cutover).
 * Default / missing → legacy_radius (preserve Production hard-radius behavior).
 */

export const DELIVERY_SERVICE_AREA_AUTHORITY = {
  LEGACY_RADIUS: "legacy_radius",
  V2_LGU: "v2_lgu",
} as const;

export type DeliveryServiceAreaAuthority =
  (typeof DELIVERY_SERVICE_AREA_AUTHORITY)[keyof typeof DELIVERY_SERVICE_AREA_AUTHORITY];

export function parseDeliveryServiceAreaAuthority(raw: unknown): DeliveryServiceAreaAuthority {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU) {
    return DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU;
  }
  return DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS;
}

export function isV2LguDeliveryAuthority(raw: unknown): boolean {
  return parseDeliveryServiceAreaAuthority(raw) === DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU;
}
