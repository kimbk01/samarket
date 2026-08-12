import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

export type StoreLocationCurrent = {
  place_id?: string | null;
  formatted_address?: string | null;
  address_line1?: string | null;
  lat?: unknown;
  lng?: unknown;
};

export type StoreLocationPatch = {
  place_id?: string | null;
  formatted_address?: string | null;
  address_line1?: string | null;
  lat?: number | null;
  lng?: number | null;
};

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function identityChanged(current: StoreLocationCurrent, patch: StoreLocationPatch): boolean {
  if (patch.place_id !== undefined && norm(patch.place_id) !== norm(current.place_id)) return true;
  if (patch.formatted_address !== undefined && norm(patch.formatted_address) !== norm(current.formatted_address)) {
    return true;
  }
  if (patch.address_line1 !== undefined && norm(patch.address_line1) !== norm(current.address_line1)) return true;
  return false;
}

/**
 * Policy A (Google) + no silent string/geo split:
 * - place_id in patch ⇒ formatted_address + finite lat/lng in the same PATCH
 * - street/formatted/place identity change ⇒ finite lat AND lng in the same PATCH
 * - detail-only (`detail_address` / address_line2) is not this helper's concern
 */
export function assertStoreLocationPatchConsistent(
  current: StoreLocationCurrent,
  patch: StoreLocationPatch,
): "ok" | "store_location_inconsistent" {
  const latIn = patch.lat !== undefined;
  const lngIn = patch.lng !== undefined;
  if (latIn !== lngIn) return "store_location_inconsistent";
  if (latIn && lngIn) {
    if (patch.lat == null || patch.lng == null) return "store_location_inconsistent";
    if (parseFiniteLatitude(patch.lat) == null || parseFiniteLongitude(patch.lng) == null) {
      return "store_location_inconsistent";
    }
  }

  const placeIn = patch.place_id !== undefined && norm(patch.place_id).length > 0;
  if (placeIn) {
    const formatted = patch.formatted_address !== undefined ? patch.formatted_address : current.formatted_address;
    if (!norm(formatted) || !latIn || !lngIn) return "store_location_inconsistent";
  }

  if (identityChanged(current, patch) && (!latIn || !lngIn)) {
    return "store_location_inconsistent";
  }

  return "ok";
}
