import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import type { CanonicalAddressDraft, CanonicalPreferredPlace } from "@/lib/addresses/canonical-address-draft";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { isSuitableEstablishmentDisplayName } from "@/lib/map/ph-friendly-address";
import {
  PLACE_FIELDS_POI_FULL,
  fetchPlaceDetailsAsLegacyPlaceResult,
} from "@/lib/map/places-new-api";
import {
  pickGeocoderPoiPlaceId,
  pickStreetLikeGeocoderResult,
} from "@/lib/map/resolve-trade-meet-spot-display-line";

function pickLongName(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string,
): string | null {
  if (!components?.length) return null;
  for (const c of components) {
    if (c.types?.includes(type) && c.long_name?.trim()) return c.long_name.trim();
  }
  return null;
}

function realPlaceName(
  name: string | null | undefined,
  components: google.maps.GeocoderAddressComponent[],
): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  if (!isSuitableEstablishmentDisplayName(n, components)) return null;
  return n;
}

function streetLineFromComponents(components: google.maps.GeocoderAddressComponent[]): {
  streetNumber: string | null;
  route: string | null;
  streetAddress: string | null;
} {
  const streetNumber = pickLongName(components, "street_number");
  const route = pickLongName(components, "route");
  const streetAddress = [streetNumber, route].filter(Boolean).join(" ").trim() || route || null;
  return { streetNumber, route, streetAddress };
}

function formattedFromStreet(
  components: google.maps.GeocoderAddressComponent[],
  fallback: string,
): string {
  const parsed = parsePhFromGooglePlaceResult({
    address_components: components,
    formatted_address: fallback,
  } as google.maps.places.PlaceResult);
  const { streetAddress } = streetLineFromComponents(components);
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

function draftFromPlaceAndStreet(args: {
  latitude: number;
  longitude: number;
  place: google.maps.places.PlaceResult | null;
  fallbackPlaceId: string | null;
  streetComponents: google.maps.GeocoderAddressComponent[];
  streetFormatted: string;
  identitySource: CanonicalAddressDraft["identitySource"];
  samePlaceAsPreferred: boolean;
}): CanonicalAddressDraft {
  const street = streetLineFromComponents(args.streetComponents);
  const parsed = parsePhFromGooglePlaceResult({
    address_components: args.streetComponents,
    formatted_address: args.streetFormatted,
    name: undefined,
  } as google.maps.places.PlaceResult);
  const fromDetails = realPlaceName(
    args.place?.name,
    args.place?.address_components ?? args.streetComponents,
  );
  const fromStreetFilter = realPlaceName(args.place?.name, args.streetComponents);
  const kept =
    args.identitySource === "preferred_place"
      ? (fromDetails || fromStreetFilter || ((args.place?.name ?? "").trim() || null))
      : fromDetails || fromStreetFilter;
  const streetLine = street.streetAddress;
  const placeName =
    kept && streetLine && kept.trim().toLowerCase() === streetLine.toLowerCase() ? null : kept;
  const placeId = ((args.place?.place_id || args.fallbackPlaceId || "") as string).trim() || null;
  return {
    latitude: args.latitude,
    longitude: args.longitude,
    placeId,
    placeName,
    placeTypes: [...(args.place?.types ?? [])],
    streetNumber: street.streetNumber,
    route: street.route,
    streetAddress: street.streetAddress || parsed.routeLine,
    barangay: parsed.barangay,
    cityMunicipality: parsed.cityMunicipality,
    province: parsed.province,
    postalCode: pickLongName(args.streetComponents, "postal_code"),
    neighborhoodName: parsed.neighborhood,
    formattedAddress: formattedFromStreet(args.streetComponents, args.streetFormatted),
    identitySource: placeName ? args.identitySource : "address_only",
    samePlaceAsPreferred: args.samePlaceAsPreferred && Boolean(placeName),
  };
}

/** Google viewport only — never a magic meter radius. */
export function isPinInsidePreferredViewport(
  marker: google.maps.LatLngLiteral,
  place: google.maps.places.PlaceResult,
): boolean {
  const viewport = place.geometry?.viewport;
  if (!viewport || typeof viewport.contains !== "function") return false;
  return viewport.contains(new google.maps.LatLng(marker.lat, marker.lng));
}

function geocoderMentionsPlaceId(
  results: google.maps.GeocoderResult[],
  placeId: string,
): boolean {
  const id = placeId.trim();
  if (!id) return false;
  return results.some((r) => (r.place_id ?? "").trim() === id);
}

function coordFromLocation(
  loc: google.maps.LatLng | google.maps.LatLngLiteral | undefined,
  axis: "lat" | "lng",
): number {
  if (!loc) return NaN;
  const value = loc[axis];
  if (typeof value === "function") return value.call(loc);
  return typeof value === "number" ? value : NaN;
}

/**
 * Place Details → canonical draft. No Google network. Search select uses this after getDetails.
 */
export function buildCanonicalDraftFromPlaceResult(
  place: google.maps.places.PlaceResult,
  pin?: google.maps.LatLngLiteral | null,
): CanonicalAddressDraft | null {
  const loc = place.geometry?.location;
  const latitude = pin?.lat ?? coordFromLocation(loc, "lat");
  const longitude = pin?.lng ?? coordFromLocation(loc, "lng");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const components = place.address_components ?? [];
  const formatted = (place.formatted_address ?? "").trim();
  if (!formatted && !components.length) return null;
  const street = streetLineFromComponents(components);
  const parsed = parsePhFromGooglePlaceResult(place);
  const placeName = realPlaceName(place.name, components);
  return {
    latitude,
    longitude,
    placeId: ((place.place_id ?? "") as string).trim() || null,
    placeName,
    placeTypes: [...(place.types ?? [])],
    streetNumber: street.streetNumber,
    route: street.route,
    streetAddress: street.streetAddress || parsed.routeLine,
    barangay: parsed.barangay,
    cityMunicipality: parsed.cityMunicipality,
    province: parsed.province,
    postalCode: pickLongName(components, "postal_code"),
    neighborhoodName: parsed.neighborhood,
    formattedAddress: formattedFromStreet(components, formatted),
    identitySource: placeName ? "place_details" : "address_only",
    samePlaceAsPreferred: false,
  };
}

export async function resolveCanonicalAddressFromPlaceId(
  placeId: string,
  pin?: google.maps.LatLngLiteral | null,
): Promise<CanonicalAddressDraft | null> {
  const pid = placeId.trim();
  if (!pid) return null;
  await loadGoogleMaps();
  const place = await fetchPlaceDetailsAsLegacyPlaceResult(pid, PLACE_FIELDS_POI_FULL);
  if (!place) return null;
  const draft = buildCanonicalDraftFromPlaceResult(place, pin);
  if (!draft) return null;
  return { ...draft, placeId: draft.placeId || pid };
}

export async function resolveCanonicalAddressFromLatLng(
  latitude: number,
  longitude: number,
  preferred?: CanonicalPreferredPlace | null,
): Promise<CanonicalAddressDraft | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const marker = { lat: latitude, lng: longitude };
  const resp = await geocoder.geocode({
    location: marker,
    language: GOOGLE_MAPS_ADDRESS_LANGUAGE,
  });
  const geoResults = resp.results ?? [];
  const streetResult = pickStreetLikeGeocoderResult(geoResults) ?? geoResults[0];
  if (!streetResult?.formatted_address) return null;
  const streetComponents = streetResult.address_components ?? [];
  const streetFormatted = streetResult.formatted_address.trim();
  const streetPlaceId =
    typeof streetResult.place_id === "string" ? streetResult.place_id.trim() || null : null;

  const preferredId = (preferred?.placeId ?? "").trim();
  if (preferredId) {
    const preferredPlace = await fetchPlaceDetailsAsLegacyPlaceResult(preferredId, PLACE_FIELDS_POI_FULL);
    const keepPreferred =
      Boolean(preferredPlace) &&
      (isPinInsidePreferredViewport(marker, preferredPlace!) ||
        geocoderMentionsPlaceId(geoResults, preferredId));
    if (keepPreferred && preferredPlace) {
      const preferredComponents = preferredPlace.address_components ?? streetComponents;
      const keptName =
        realPlaceName(preferredPlace.name, preferredComponents) ||
        realPlaceName(preferred?.placeName, preferredComponents) ||
        ((preferred?.placeName ?? "").trim() || null);
      return draftFromPlaceAndStreet({
        latitude,
        longitude,
        place: { ...preferredPlace, name: keptName || preferredPlace.name },
        fallbackPlaceId: preferredId,
        streetComponents,
        streetFormatted,
        identitySource: "preferred_place",
        samePlaceAsPreferred: true,
      });
    }
  }

  const poiPlaceId = pickGeocoderPoiPlaceId(geoResults);
  if (poiPlaceId) {
    const poiPlace = await fetchPlaceDetailsAsLegacyPlaceResult(poiPlaceId, PLACE_FIELDS_POI_FULL);
    const poiName = realPlaceName(poiPlace?.name, streetComponents);
    if (poiName && poiPlace) {
      const inside =
        isPinInsidePreferredViewport(marker, poiPlace) ||
        geocoderMentionsPlaceId(geoResults, poiPlaceId);
      if (inside) {
        return draftFromPlaceAndStreet({
          latitude,
          longitude,
          place: poiPlace,
          fallbackPlaceId: poiPlaceId,
          streetComponents,
          streetFormatted,
          identitySource: "geocoder_poi",
          samePlaceAsPreferred: false,
        });
      }
    }
  }

  const parsedStreet = parsePhFromGooglePlaceResult({
    address_components: streetComponents,
    formatted_address: streetFormatted,
  } as google.maps.places.PlaceResult);
  const streetBits = streetLineFromComponents(streetComponents);
  return {
    latitude,
    longitude,
    placeId: streetPlaceId,
    placeName: null,
    placeTypes: [],
    streetNumber: streetBits.streetNumber,
    route: streetBits.route,
    streetAddress: streetBits.streetAddress || parsedStreet.routeLine,
    barangay: parsedStreet.barangay,
    cityMunicipality: parsedStreet.cityMunicipality,
    province: parsedStreet.province,
    postalCode: pickLongName(streetComponents, "postal_code"),
    neighborhoodName: parsedStreet.neighborhood,
    formattedAddress: formattedFromStreet(streetComponents, streetFormatted),
    identitySource: "address_only",
    samePlaceAsPreferred: false,
  };
}

export function draftFromSavedRow(row: {
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  buildingName: string | null;
  streetAddress: string | null;
  barangay: string | null;
  cityMunicipality: string | null;
  province: string | null;
  neighborhoodName: string | null;
  formattedAddress: string | null;
  roadAddress?: string | null;
  fullAddress?: string | null;
}): CanonicalAddressDraft | null {
  const latitude = row.latitude;
  const longitude = row.longitude;
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const placeName = (row.buildingName ?? "").trim() || null;
  const street = (row.streetAddress ?? "").trim() || null;
  return {
    latitude,
    longitude,
    placeId: (row.placeId ?? "").trim() || null,
    placeName: placeName && street && placeName.toLowerCase() === street.toLowerCase() ? null : placeName,
    placeTypes: [],
    streetNumber: null,
    route: null,
    streetAddress: street,
    barangay: (row.barangay ?? "").trim() || null,
    cityMunicipality: (row.cityMunicipality ?? "").trim() || null,
    province: (row.province ?? "").trim() || null,
    postalCode: null,
    neighborhoodName: (row.neighborhoodName ?? "").trim() || null,
    formattedAddress:
      (row.formattedAddress ?? row.roadAddress ?? row.fullAddress ?? "").trim() || null,
    identitySource: placeName ? "place_details" : "address_only",
    samePlaceAsPreferred: false,
  };
}
