/**
 * Address Editor — Google place / building / street identity (R1).
 *
 * DO NOT collapse placeDisplayName + buildingName + street into one string in Editor state.
 * DO NOT blindly sticky previous names after pin move.
 * DO NOT wipe search Place identity solely because reverse has no `name`.
 *
 * SSOT (platform):
 * - ONE `user_addresses` FULL row — no Trade/Community/Delivery/Public duplicate storage.
 * - STORAGE ≠ DISPLAY — FULL formatters vs `formatPublicAddress` (city/region only).
 * - Google Place identity is an *input* to the FULL row, not a caller-scoped store.
 *
 * DB mapping (no place_display_name migration unless R2 runtime proves schema loss):
 * - `building_name` = best human-readable place/building headline
 * - `landmark` = secondary distinct place/building when needed
 * - `place_id` / lat/lng / formatted / road / admin / detail = existing columns
 * - MIGRATION REQUIRED: NOT PROVEN (do not invent columns from R1 code audit alone)
 */

import { haversineKm } from "@/lib/geo/haversine-km";
import type { ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";
import {
  parsePhFromGooglePlaceResult,
  type PhGooglePlaceParsed,
} from "@/lib/addresses/ph-google-place-address-components";

/** Same-building micro-adjust — keep Place identity when reverse is street-only / vicinity. */
export const EDITOR_SAME_PREMISE_MAX_M = 80;
/** Beyond this, prefer replacing identity when reverse/nearby shows a different POI. */
export const EDITOR_DIFFERENT_PREMISE_MIN_M = 120;

export type EditorPlaceIdentity = {
  placeId: string;
  placeDisplayName: string;
  buildingName: string;
  landmarkName: string;
  streetAddress: string;
  formattedAddress: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  neighborhoodName: string;
  latitude: number;
  longitude: number;
};

export type EditorPlaceIdentityAnchor = {
  placeId: string;
  placeDisplayName: string;
  buildingName: string;
  landmarkName: string;
  latitude: number;
  longitude: number;
};

export type ReconcilePinIdentityResult = {
  identity: EditorPlaceIdentity;
  mode: "same_premise" | "different_premise" | "uncertain_keep" | "uncertain_replace";
  distanceMeters: number | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function eqName(a: string, b: string): boolean {
  const x = norm(a).toLowerCase();
  const y = norm(b).toLowerCase();
  return Boolean(x) && x === y;
}

function looksLikeStreetOnlyHeadline(name: string, routeLine: string): boolean {
  const n = norm(name);
  if (!n) return true;
  if (routeLine && eqName(n, routeLine)) return true;
  if (
    /^\d+[A-Za-z]?\s/.test(n) &&
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|blvd\.?|boulevard|drive|dr\.?)\b/i.test(n)
  ) {
    return true;
  }
  return false;
}

const POI_TYPE_HINTS = new Set([
  "establishment",
  "point_of_interest",
  "premise",
  "shopping_mall",
  "store",
  "restaurant",
  "cafe",
  "hospital",
  "lodging",
  "tourist_attraction",
  "supermarket",
  "department_store",
]);

function placeTypesHintPoi(types: string[] | undefined): boolean {
  if (!types?.length) return false;
  return types.some((t) => POI_TYPE_HINTS.has(t));
}

/**
 * Place Details → Editor identity.
 * place.name → placeDisplayName (when not street-only).
 * address_components premise → buildingName only when distinct from place name.
 * Does not invent building when Google only returns a place name.
 */
export function identityFromPlaceDetails(
  place: google.maps.places.PlaceResult,
  lat: number,
  lng: number,
): EditorPlaceIdentity {
  const parsed = parsePhFromGooglePlaceResult(place);
  const formatted = norm(place.formatted_address) || "";
  const placeId = norm(place.place_id);
  const rawName = norm(place.name);
  const route = norm(parsed.routeLine);
  const premise = norm(parsed.premiseName);

  let placeDisplayName = "";
  if (rawName && !looksLikeStreetOnlyHeadline(rawName, route)) {
    placeDisplayName = rawName;
  } else if (placeTypesHintPoi(place.types) && rawName) {
    placeDisplayName = rawName;
  }

  let buildingName = "";
  if (premise && !eqName(premise, placeDisplayName) && !looksLikeStreetOnlyHeadline(premise, route)) {
    buildingName = premise;
  }

  const streetAddress = route || formatted.split(",")[0]?.trim() || "";

  return {
    placeId,
    placeDisplayName,
    buildingName,
    landmarkName: "",
    streetAddress,
    formattedAddress: formatted,
    barangay: norm(parsed.barangay),
    cityMunicipality: norm(parsed.cityMunicipality),
    province: norm(parsed.province),
    neighborhoodName: norm(parsed.neighborhood),
    latitude: lat,
    longitude: lng,
  };
}

function reverseHeadline(r: ReverseGeocodePhResult): string {
  return (
    norm(r.parsed.buildingOrPlaceHeadline) ||
    norm(r.buildingOrPlaceNames?.[0]) ||
    ""
  );
}

function reverseMentionsName(r: ReverseGeocodePhResult, name: string): boolean {
  const n = norm(name);
  if (!n) return false;
  if (eqName(reverseHeadline(r), n)) return true;
  if (eqName(norm(r.parsed.premiseName), n)) return true;
  for (const x of r.buildingOrPlaceNames ?? []) {
    if (eqName(x, n)) return true;
  }
  const fa = norm(r.formattedAddress).toLowerCase();
  return fa.includes(n.toLowerCase());
}

function reverseSuggestsDifferentPoi(r: ReverseGeocodePhResult, prevName: string): boolean {
  const prev = norm(prevName);
  const head = reverseHeadline(r);
  if (!head || looksLikeStreetOnlyHeadline(head, norm(r.parsed.routeLine))) return false;
  if (!prev) return true;
  return !eqName(head, prev) && !reverseMentionsName(r, prev);
}

/**
 * Pin move reconciliation using Geocoder + existing reverse nearby names only.
 * No extra Nearby Search beyond `reverseGeocodeLatLngPh`.
 */
export function reconcileIdentityAfterPinMove(args: {
  previous: EditorPlaceIdentity;
  anchor: EditorPlaceIdentityAnchor | null;
  reverse: ReverseGeocodePhResult;
}): ReconcilePinIdentityResult {
  const { previous, anchor, reverse } = args;
  const lat = reverse.latitude;
  const lng = reverse.longitude;
  const route = norm(reverse.parsed.routeLine);
  const formatted = norm(reverse.formattedAddress);
  const streetAddress = route || formatted.split(",")[0]?.trim() || previous.streetAddress;
  const nextPlaceId = norm(reverse.placeId) || previous.placeId;

  const baseGeo = {
    streetAddress,
    formattedAddress: formatted || previous.formattedAddress,
    barangay: norm(reverse.parsed.barangay) || previous.barangay,
    cityMunicipality: norm(reverse.parsed.cityMunicipality) || previous.cityMunicipality,
    province: norm(reverse.parsed.province) || previous.province,
    neighborhoodName: norm(reverse.parsed.neighborhood) || previous.neighborhoodName,
    latitude: lat,
    longitude: lng,
  };

  const originLat = anchor?.latitude ?? previous.latitude;
  const originLng = anchor?.longitude ?? previous.longitude;
  const distanceMeters =
    Number.isFinite(originLat) && Number.isFinite(originLng)
      ? (() => {
          const km = haversineKm(originLat, originLng, lat, lng);
          return km == null ? null : km * 1000;
        })()
      : null;

  const prevDisplay = norm(anchor?.placeDisplayName || previous.placeDisplayName);
  const prevBuilding = norm(anchor?.buildingName || previous.buildingName);
  const prevLandmark = norm(anchor?.landmarkName || previous.landmarkName);
  const anchorPlaceId = norm(anchor?.placeId || previous.placeId);

  const samePlaceId = Boolean(anchorPlaceId && reverse.placeId && eqName(anchorPlaceId, reverse.placeId));
  const mentionsPrev = prevDisplay ? reverseMentionsName(reverse, prevDisplay) : false;
  const streetOnlyReverse = !reverseHeadline(reverse) || looksLikeStreetOnlyHeadline(reverseHeadline(reverse), route);
  const differentPoi = reverseSuggestsDifferentPoi(reverse, prevDisplay);
  const prevIsStreetOnly =
    !prevDisplay ||
    looksLikeStreetOnlyHeadline(prevDisplay, norm(previous.streetAddress)) ||
    looksLikeStreetOnlyHeadline(prevDisplay, route);

  const keepIdentity = (): EditorPlaceIdentity => ({
    ...previous,
    ...baseGeo,
    placeId: samePlaceId ? previous.placeId || nextPlaceId : previous.placeId || nextPlaceId,
    placeDisplayName: prevDisplay,
    buildingName: prevBuilding,
    landmarkName: prevLandmark,
  });

  const replaceFromReverse = (): EditorPlaceIdentity => {
    const head = reverseHeadline(reverse);
    const premise = norm(reverse.parsed.premiseName);
    let placeDisplayName = "";
    let buildingName = "";
    if (head && !looksLikeStreetOnlyHeadline(head, route)) {
      placeDisplayName = head;
    }
    if (premise && !eqName(premise, placeDisplayName) && !looksLikeStreetOnlyHeadline(premise, route)) {
      buildingName = premise;
    } else if (!placeDisplayName && premise) {
      buildingName = premise;
    }
    return {
      placeId: nextPlaceId,
      placeDisplayName,
      buildingName,
      landmarkName: "",
      ...baseGeo,
    };
  };

  /**
   * Search was street-only but pin/reverse found a real POI (Villa Milagros case):
   * adopt reverse POI even inside same-premise distance — do not sticky the street label.
   */
  if (prevIsStreetOnly && !streetOnlyReverse && reverseHeadline(reverse)) {
    return { identity: replaceFromReverse(), mode: "different_premise", distanceMeters };
  }

  if (distanceMeters != null && distanceMeters <= EDITOR_SAME_PREMISE_MAX_M) {
    if (samePlaceId || mentionsPrev || streetOnlyReverse || !differentPoi) {
      return { identity: keepIdentity(), mode: "same_premise", distanceMeters };
    }
  }

  if (distanceMeters != null && distanceMeters >= EDITOR_DIFFERENT_PREMISE_MIN_M && differentPoi) {
    return { identity: replaceFromReverse(), mode: "different_premise", distanceMeters };
  }

  if (differentPoi && !mentionsPrev && !streetOnlyReverse) {
    return { identity: replaceFromReverse(), mode: "uncertain_replace", distanceMeters };
  }

  if (prevDisplay || prevBuilding) {
    return { identity: keepIdentity(), mode: "uncertain_keep", distanceMeters };
  }

  return { identity: replaceFromReverse(), mode: "uncertain_replace", distanceMeters };
}

/** Preview headline — place name preferred, else building; never duplicate street. */
export function editorPlacePreviewHeadline(id: Pick<EditorPlaceIdentity, "placeDisplayName" | "buildingName">): string {
  const place = norm(id.placeDisplayName);
  const building = norm(id.buildingName);
  if (place && building && !eqName(place, building)) return place;
  return place || building;
}

export function editorPlacePreviewSubline(
  id: Pick<EditorPlaceIdentity, "placeDisplayName" | "buildingName" | "streetAddress" | "formattedAddress" | "cityMunicipality">,
): string {
  const headline = editorPlacePreviewHeadline(id);
  const street = norm(id.streetAddress);
  const city = norm(id.cityMunicipality);
  const formatted = norm(id.formattedAddress);
  const parts: string[] = [];
  if (street && !eqName(street, headline)) parts.push(street);
  else if (formatted) {
    const stripped = formatted
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && !eqName(p, headline) && !/^philippines$/i.test(p));
    if (stripped.length) parts.push(stripped.slice(0, 3).join(", "));
  }
  if (city && !parts.some((p) => p.toLowerCase().includes(city.toLowerCase()))) {
    parts.push(city);
  }
  return parts.join(", ");
}

/**
 * Persist into existing SSOT columns (no new place_display_name column).
 * Goal: Address Book FULL display can still identify the place after save.
 * - building_name ← placeDisplayName || buildingName (headline)
 * - landmark ← distinct building when headline is a POI name; else keep existing landmark
 *
 * Migration gate: only after R2 runtime proves these columns cannot represent FULL identity.
 */
export function mapPlaceIdentityToWriteFields(
  id: Pick<EditorPlaceIdentity, "placeDisplayName" | "buildingName" | "landmarkName">,
  existingLandmark: string,
): { buildingName: string | null; landmark: string | null } {
  const place = norm(id.placeDisplayName);
  const building = norm(id.buildingName);
  const landmarkName = norm(id.landmarkName);
  const existing = norm(existingLandmark);

  const buildingOut = place || building || null;
  let landmarkOut: string | null = existing || null;
  if (place && building && !eqName(place, building)) {
    landmarkOut = building;
  } else if (landmarkName && (!place || !eqName(landmarkName, place))) {
    landmarkOut = landmarkName;
  } else if (!place && !building) {
    landmarkOut = existing || null;
  }
  return { buildingName: buildingOut, landmark: landmarkOut };
}

/** Hydrate Editor identity from saved row (collapsed legacy allowed). */
export function identityFromSavedAddress(row: {
  placeId?: string | null;
  buildingName?: string | null;
  landmark?: string | null;
  streetAddress?: string | null;
  formattedAddress?: string | null;
  fullAddress?: string | null;
  barangay?: string | null;
  cityMunicipality?: string | null;
  province?: string | null;
  neighborhoodName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): EditorPlaceIdentity {
  const building = norm(row.buildingName);
  const landmark = norm(row.landmark);
  return {
    placeId: norm(row.placeId),
    placeDisplayName: building,
    buildingName: landmark && building && !eqName(landmark, building) ? landmark : "",
    landmarkName: "",
    streetAddress: norm(row.streetAddress),
    formattedAddress: norm(row.formattedAddress) || norm(row.fullAddress),
    barangay: norm(row.barangay),
    cityMunicipality: norm(row.cityMunicipality),
    province: norm(row.province),
    neighborhoodName: norm(row.neighborhoodName),
    latitude: row.latitude ?? NaN,
    longitude: row.longitude ?? NaN,
  };
}

export type { PhGooglePlaceParsed };
