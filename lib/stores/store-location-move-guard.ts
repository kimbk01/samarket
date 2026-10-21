/**
 * Owner store location write guards (server).
 *
 * - LOC-013: coordinates re-sent unchanged (7 decimal places) are NOT a location change —
 *   drop them from the post-write side-effect patch so checkout-geo refresh / geo discovery
 *   invalidation run only on a real move (the DB write itself may keep them: same value).
 * - LOC-007: a real move > 1 km from the saved pin, or a pin whose nearest LGU differs from the
 *   saved City/Municipality LGU, needs an explicit owner confirmation (`confirmLocationMove: true`).
 *   This is a confirmation, not an approval step (G-2 §3-A LOC-007 §8).
 */
import { haversineKm } from "@/lib/geo/haversine-km";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import { resolveStoreHomeLguId } from "@/lib/delivery/service-area/candidate-discovery";

export const STORE_LOCATION_MOVE_CONFIRM_REQUIRED_ERROR = "store_location_move_confirm_required" as const;
/** Move distance (km) from the saved pin above which the owner must confirm. */
export const STORE_LOCATION_MOVE_CONFIRM_KM = 1;

const COORD_SCALE = 1e7;

/** Same coordinate at 7 decimal places (≈ 1 cm). */
export function sameStoreCoord(a: unknown, b: unknown): boolean {
  const x = typeof a === "number" ? a : a == null || a === "" ? null : Number(a);
  const y = typeof b === "number" ? b : b == null || b === "" ? null : Number(b);
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
    return x == null && y == null;
  }
  return Math.round(x * COORD_SCALE) === Math.round(y * COORD_SCALE);
}

/** True when `patch` really moves the store pin (lat/lng differ from the current row at 7 dp). */
export function storeCoordsPatchChangesPin(
  patch: Record<string, unknown>,
  current: { lat?: unknown; lng?: unknown }
): boolean {
  const hasLat = Object.prototype.hasOwnProperty.call(patch, "lat");
  const hasLng = Object.prototype.hasOwnProperty.call(patch, "lng");
  if (!hasLat && !hasLng) return false;
  const nextLat = hasLat ? patch.lat : current.lat;
  const nextLng = hasLng ? patch.lng : current.lng;
  return !(sameStoreCoord(nextLat, current.lat) && sameStoreCoord(nextLng, current.lng));
}

/**
 * Copy of `patch` without `lat`/`lng` when they do not move the pin — for post-write side effects
 * (discovery invalidation reason selection). The original patch object is not modified.
 */
export function withoutUnchangedStoreCoords(
  patch: Record<string, unknown>,
  current: { lat?: unknown; lng?: unknown }
): Record<string, unknown> {
  if (storeCoordsPatchChangesPin(patch, current)) return patch;
  if (!("lat" in patch) && !("lng" in patch)) return patch;
  const rest = { ...patch };
  delete rest.lat;
  delete rest.lng;
  return rest;
}

export type StoreLocationMoveEvaluation = {
  requiresConfirm: boolean;
  /** Straight-line move from the saved pin (km, 3 dp); null when there was no saved pin. */
  moveKm: number | null;
  cityLguId: string | null;
  pinLguId: string | null;
  reasons: Array<"move_over_1km" | "lgu_mismatch">;
};

export function evaluateStoreLocationMove(input: {
  currentLat: unknown;
  currentLng: unknown;
  nextLat: unknown;
  nextLng: unknown;
  /** Effective (post-patch) City/Municipality + region of the store. */
  city: string | null | undefined;
  region: string | null | undefined;
}): StoreLocationMoveEvaluation {
  const nla = parseFiniteLatitude(input.nextLat);
  const nln = parseFiniteLongitude(input.nextLng);
  const reasons: StoreLocationMoveEvaluation["reasons"] = [];
  if (nla == null || nln == null) {
    return { requiresConfirm: false, moveKm: null, cityLguId: null, pinLguId: null, reasons };
  }
  const cla = parseFiniteLatitude(input.currentLat);
  const cln = parseFiniteLongitude(input.currentLng);
  let moveKm: number | null = null;
  if (cla != null && cln != null) {
    const d = haversineKm(cla, cln, nla, nln);
    if (d != null && Number.isFinite(d)) {
      moveKm = Math.round(d * 1000) / 1000;
      if (moveKm > STORE_LOCATION_MOVE_CONFIRM_KM) reasons.push("move_over_1km");
    }
  }
  const city = String(input.city ?? "").trim();
  const region = String(input.region ?? "").trim();
  const cityLguId =
    city || region ? resolveStoreHomeLguId({ cityMunicipality: city, province: region }) : null;
  const pinLguId = resolveStoreHomeLguId({ storeLat: nla, storeLng: nln });
  if (cityLguId && pinLguId && cityLguId !== pinLguId) reasons.push("lgu_mismatch");
  return { requiresConfirm: reasons.length > 0, moveKm, cityLguId, pinLguId, reasons };
}
