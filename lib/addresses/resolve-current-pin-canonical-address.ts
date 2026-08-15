/**
 * CURRENT PIN ADDRESS SSOT — sole MEMBER address-pin identity resolver.
 *
 * Search = initial pin placement only.
 * Current pin = current address authority.
 * Save = canonical address at the current pin.
 *
 * No preferred/search identity authority. No A+C KEEP/USE. No city/viewport continuity.
 * STORE physical / owner / admin addresses are out of scope.
 */

import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import {
  fetchPlaceDetailsAsLegacyPlaceResult,
  searchNearbyAsLegacyPlaceResults,
  PLACE_FIELDS_POI_FULL,
} from "@/lib/map/places-new-api";
import { haversineKm } from "@/lib/geo/haversine-km";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";

type AddressComponent = google.maps.GeocoderAddressComponent;

export type CurrentPinIdentityKind =
  | "establishment"
  | "premise"
  | "road"
  | "barangay"
  | "admin"
  | "other";

export type CurrentPinIdentityCandidate = {
  source: "places_nearby" | "places_details" | "geocoder_premise" | "geocoder_street";
  placeId: string | null;
  name: string;
  kinds: string[];
  identityKind: CurrentPinIdentityKind;
  distanceMeters: number | null;
  geometry: { lat: number; lng: number } | null;
};

const HARD_REJECT_TYPES = new Set([
  "transit_station",
  "bus_station",
  "subway_station",
  "train_station",
  "light_rail_station",
  "airport",
  "route",
  "street_address",
  "intersection",
  "plus_code",
  "political",
  "country",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "administrative_area_level_4",
  "administrative_area_level_5",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "neighborhood",
  "colloquial_area",
]);

/** Always reject — even when Google also tags `point_of_interest`. */
const HARD_REJECT_ALWAYS_TYPES = new Set([
  "transit_station",
  "bus_station",
  "subway_station",
  "train_station",
  "light_rail_station",
  "airport",
  "route",
  "street_address",
  "intersection",
  "plus_code",
]);

const ESTABLISHMENT_TYPES = new Set([
  "establishment",
  "point_of_interest",
  "store",
  "restaurant",
  "cafe",
  "food",
  "shopping_mall",
  "lodging",
  "gym",
  "hospital",
  "pharmacy",
  "bank",
  "atm",
  "church",
  "place_of_worship",
  "school",
  "university",
  "tourist_attraction",
  "museum",
  "park",
  "bar",
  "night_club",
  "beauty_salon",
  "spa",
  "laundry",
  "car_repair",
  "gas_station",
  "parking",
  "supermarket",
  "convenience_store",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
]);

const PREMISE_TYPES = new Set(["premise", "subpremise", "floor", "room"]);

/** Nearby search window only — not an identity truth boundary. Ranking decides the winner. */
const NEARBY_SEARCH_RADIUS_M = 100;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstByTypes(components: AddressComponent[], types: string[]): string | null {
  for (const type of types) {
    const hit = components.find((c) => c.types?.includes(type));
    const v = clean(hit?.long_name ?? hit?.short_name ?? "");
    if (v) return v;
  }
  return null;
}

function classifyIdentityKind(kinds: string[]): CurrentPinIdentityKind {
  const set = new Set(kinds.map((k) => k.toLowerCase()));
  if ([...set].some((k) => HARD_REJECT_ALWAYS_TYPES.has(k))) {
    if ([...set].some((k) => k === "route" || k === "street_address" || k === "intersection")) return "road";
    return "other";
  }
  const hasEstablishment = [...set].some((k) => ESTABLISHMENT_TYPES.has(k));
  const hasPremise = [...set].some((k) => PREMISE_TYPES.has(k));
  if (hasEstablishment) return "establishment";
  if (hasPremise) return "premise";
  if ([...set].some((k) => k === "route" || k === "street_address" || k === "intersection")) return "road";
  if ([...set].some((k) => k.includes("sublocality") || k === "neighborhood")) return "barangay";
  if ([...set].some((k) => k.includes("administrative") || k === "locality" || k === "political")) {
    return "admin";
  }
  return "other";
}

export function isHardRejectedCurrentPinIdentity(
  candidate: Pick<CurrentPinIdentityCandidate, "kinds" | "identityKind">,
): boolean {
  const kinds = candidate.kinds.map((k) => k.toLowerCase());
  if (kinds.some((k) => HARD_REJECT_ALWAYS_TYPES.has(k))) return true;
  const hasEstablishment = kinds.some((k) => ESTABLISHMENT_TYPES.has(k));
  const hasPremise = kinds.some((k) => PREMISE_TYPES.has(k));
  if (hasEstablishment || hasPremise) return false;
  return kinds.some((k) => HARD_REJECT_TYPES.has(k));
}

function identityRankScore(kind: CurrentPinIdentityKind): number {
  switch (kind) {
    case "establishment":
      return 400;
    case "premise":
      return 320;
    case "other":
      return 80;
    case "road":
      return 40;
    case "barangay":
      return 20;
    case "admin":
      return 0;
    default:
      return 0;
  }
}

/**
 * Central ranking: type evidence + proximity + premise/building preference.
 * Never treat "nearest Places result" alone as winner.
 */
export function rankCurrentPinIdentityCandidates(
  candidates: CurrentPinIdentityCandidate[],
): CurrentPinIdentityCandidate | null {
  const eligible = candidates.filter((c) => {
    if (!clean(c.name)) return false;
    if (isHardRejectedCurrentPinIdentity(c)) return false;
    if (c.identityKind === "road" || c.identityKind === "barangay" || c.identityKind === "admin") {
      return false;
    }
    return c.identityKind === "establishment" || c.identityKind === "premise" || c.identityKind === "other";
  });
  if (!eligible.length) return null;

  const scored = eligible.map((c) => {
    const typeScore = identityRankScore(c.identityKind);
    const dist = c.distanceMeters;
    // Soft proximity: closer is better, but type dominates within ~120m.
    const proximityScore =
      dist == null ? 0 : dist <= 25 ? 100 : dist <= 50 ? 70 : dist <= 80 ? 40 : dist <= 120 ? 15 : -40;
    const sourceBonus =
      c.source === "geocoder_premise" ? 25 : c.source === "places_details" ? 20 : c.source === "places_nearby" ? 10 : 0;
    const placeIdBonus = c.placeId ? 5 : 0;
    return { c, score: typeScore + proximityScore + sourceBonus + placeIdBonus };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.c.distanceMeters ?? Number.POSITIVE_INFINITY;
    const db = b.c.distanceMeters ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.c.name.localeCompare(b.c.name);
  });

  return scored[0]?.c ?? null;
}

function candidateFromPlaceResult(
  place: google.maps.places.PlaceResult,
  pin: { lat: number; lng: number },
  source: CurrentPinIdentityCandidate["source"],
): CurrentPinIdentityCandidate | null {
  const name = clean(place.name);
  if (!name) return null;
  const kinds = (place.types ?? []).map((t) => String(t));
  const identityKind = classifyIdentityKind(kinds);
  const loc = place.geometry?.location;
  const geometry =
    loc && typeof loc.lat === "function" && typeof loc.lng === "function"
      ? { lat: loc.lat(), lng: loc.lng() }
      : null;
  const km = geometry ? haversineKm(pin.lat, pin.lng, geometry.lat, geometry.lng) : null;
  return {
    source,
    placeId: clean(place.place_id) || null,
    name,
    kinds,
    identityKind,
    distanceMeters: km == null ? null : km * 1000,
    geometry,
  };
}

function candidateFromGeocoderResult(
  result: google.maps.GeocoderResult,
  pin: { lat: number; lng: number },
): CurrentPinIdentityCandidate | null {
  const kinds = (result.types ?? []).map((t) => String(t));
  const identityKind = classifyIdentityKind(kinds);
  const loc = result.geometry?.location;
  const geometry =
    loc && typeof loc.lat === "function" && typeof loc.lng === "function"
      ? { lat: loc.lat(), lng: loc.lng() }
      : null;
  const km = geometry ? haversineKm(pin.lat, pin.lng, geometry.lat, geometry.lng) : null;
  const distanceMeters = km == null ? null : km * 1000;

  if (identityKind === "premise" || kinds.some((k) => PREMISE_TYPES.has(k.toLowerCase()))) {
    const premiseName =
      firstByTypes(result.address_components ?? [], ["premise", "subpremise"]) ||
      clean(result.formatted_address?.split(",")[0] ?? "");
    if (!premiseName) return null;
    return {
      source: "geocoder_premise",
      placeId: clean(result.place_id) || null,
      name: premiseName,
      kinds: kinds.length ? kinds : ["premise"],
      identityKind: "premise",
      distanceMeters,
      geometry,
    };
  }

  return null;
}

function streetBitsFromComponents(components: AddressComponent[]): {
  streetNumber: string | null;
  route: string | null;
  streetAddress: string | null;
} {
  const streetNumber = firstByTypes(components, ["street_number"]);
  const route = firstByTypes(components, ["route"]);
  const streetAddress = clean([streetNumber, route].filter(Boolean).join(" ")) || route;
  return { streetNumber, route, streetAddress };
}

function formattedStreetShell(components: AddressComponent[], fallback: string): string {
  const parsed = parsePhFromGooglePlaceResult({
    address_components: components,
    formatted_address: fallback,
  } as google.maps.places.PlaceResult);
  const { streetAddress } = streetBitsFromComponents(components);
  const barangay = parsed.barangay;
  const brgy =
    barangay && !/^(barangay|brgy\.?)\b/i.test(barangay) ? `Barangay ${barangay}` : barangay;
  const joined = [streetAddress, brgy, parsed.cityMunicipality, parsed.province]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const base = joined || stripCountryFromAddressDisplayLine(fallback, "Philippines") || fallback;
  return stripCountryFromAddressDisplayLine(base, "Philippines").trim() || base;
}

function buildDraftFromGeocoderShell(
  results: google.maps.GeocoderResult[],
  lat: number,
  lng: number,
): CanonicalAddressDraft {
  const primary = results[0];
  const components = primary?.address_components ?? [];
  const street = streetBitsFromComponents(components);
  const parsed = parsePhFromGooglePlaceResult({
    address_components: components,
    formatted_address: primary?.formatted_address ?? "",
  } as google.maps.places.PlaceResult);
  const fallback = clean(primary?.formatted_address) || "";

  return {
    latitude: lat,
    longitude: lng,
    placeId: null,
    placeName: null,
    placeTypes: [],
    streetNumber: street.streetNumber,
    route: street.route,
    streetAddress: street.streetAddress || parsed.routeLine,
    barangay: parsed.barangay,
    cityMunicipality: parsed.cityMunicipality,
    province: parsed.province,
    postalCode: firstByTypes(components, ["postal_code"]),
    neighborhoodName: parsed.neighborhood,
    formattedAddress: formattedStreetShell(components, fallback),
    identitySource: "address_only",
    samePlaceAsPreferred: false,
  };
}

function applyIdentityWinner(
  base: CanonicalAddressDraft,
  winner: CurrentPinIdentityCandidate,
): CanonicalAddressDraft {
  const titleName = winner.name;
  const isBuildingLike = winner.identityKind === "premise";
  const joined = [titleName, base.streetAddress, base.barangay, base.cityMunicipality, base.province]
    .filter(Boolean)
    .join(", ");
  const formatted =
    stripCountryFromAddressDisplayLine(joined, "Philippines").trim() || joined || base.formattedAddress;

  return {
    ...base,
    placeId: winner.placeId,
    placeName: titleName,
    placeTypes: [...winner.kinds],
    formattedAddress: formatted,
    identitySource: isBuildingLike ? "geocoder_poi" : "place_details",
    samePlaceAsPreferred: false,
  };
}

function applyRoadOrBarangayFallback(base: CanonicalAddressDraft): CanonicalAddressDraft {
  return {
    ...base,
    placeId: null,
    placeName: null,
    placeTypes: [],
    identitySource: "address_only",
    samePlaceAsPreferred: false,
  };
}

async function reverseGeocodePin(pin: { lat: number; lng: number }): Promise<google.maps.GeocoderResult[]> {
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const resp = await geocoder.geocode({
    location: pin,
    language: GOOGLE_MAPS_ADDRESS_LANGUAGE,
  });
  return resp.results ?? [];
}

/**
 * Sole current-pin identity resolver for MEMBER address pin surfaces.
 * Callers must ignore prior search identity after pin move.
 */
export async function resolveCurrentPinCanonicalAddress(
  lat: number,
  lng: number,
): Promise<CanonicalAddressDraft> {
  const pin = { lat, lng };
  const geocodeResults = await reverseGeocodePin(pin);
  const base = buildDraftFromGeocoderShell(geocodeResults, lat, lng);

  const geocoderCandidates = geocodeResults
    .map((r) => candidateFromGeocoderResult(r, pin))
    .filter((c): c is CurrentPinIdentityCandidate => Boolean(c));

  let placeCandidates: CurrentPinIdentityCandidate[] = [];
  try {
    const nearby = await searchNearbyAsLegacyPlaceResults(pin, NEARBY_SEARCH_RADIUS_M);
    placeCandidates = nearby
      .map((p) => candidateFromPlaceResult(p, pin, "places_nearby"))
      .filter((c): c is CurrentPinIdentityCandidate => Boolean(c));

    // Enrich top nearby candidates with Details when place_id exists (identity confirmation).
    const topForDetails = [...placeCandidates]
      .filter((c) => c.placeId && (c.identityKind === "establishment" || c.identityKind === "premise"))
      .sort((a, b) => (a.distanceMeters ?? 9999) - (b.distanceMeters ?? 9999))
      .slice(0, 3);

    for (const c of topForDetails) {
      if (!c.placeId) continue;
      try {
        const details = await fetchPlaceDetailsAsLegacyPlaceResult(c.placeId, PLACE_FIELDS_POI_FULL);
        if (!details) continue;
        const detailed = candidateFromPlaceResult(details, pin, "places_details");
        if (detailed) placeCandidates.push(detailed);
      } catch {
        // Details failure must not block current-pin resolution.
      }
    }
  } catch {
    // Nearby failure → continue with geocoder premise / street fallback.
  }

  const winner = rankCurrentPinIdentityCandidates([...geocoderCandidates, ...placeCandidates]);
  // place_id required for POI/building identity persistence; nameless/id-less candidates fall through.
  if (winner?.placeId) return applyIdentityWinner(base, winner);
  return applyRoadOrBarangayFallback(base);
}
