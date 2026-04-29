type AddressComponent = google.maps.GeocoderAddressComponent;

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function tokenKey(value: string | null | undefined): string {
  return normalizeToken(value).toLowerCase();
}

function firstByTypes(components: AddressComponent[], types: string[]): string | null {
  for (const type of types) {
    const hit = components.find((component) => component.types?.includes(type));
    const value = normalizeToken(hit?.long_name ?? hit?.short_name ?? "");
    if (value) return value;
  }
  return null;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeToken(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/** 상호·건물명 표시에 쓰기 적합한가 — 순수 지명·도로·행정구역 라벨이면 false */
export function isSuitableEstablishmentDisplayName(
  name: string | null | undefined,
  components: AddressComponent[]
): boolean {
  const normalized = normalizeToken(name);
  if (!normalized) return false;
  return !isGenericName(normalized, components);
}

function isGenericName(name: string, components: AddressComponent[]): boolean {
  const normalized = normalizeToken(name);
  if (!normalized) return true;
  const normalizedKey = normalized.toLowerCase();
  const genericKeywords = new Set([
    "philippines",
    "metro manila",
    "barangay",
    "district",
    "road",
    "street",
  ]);
  if (genericKeywords.has(normalizedKey)) return true;

  const componentValues = uniqueNonEmpty([
    firstByTypes(components, ["street_number"]),
    firstByTypes(components, ["route"]),
    firstByTypes(components, ["sublocality_level_1", "sublocality", "neighborhood"]),
    firstByTypes(components, ["locality", "administrative_area_level_2", "administrative_area_level_1"]),
  ]).map((value) => value.toLowerCase());

  return componentValues.includes(normalizedKey);
}

function joinStreetLine(components: AddressComponent[]): string | null {
  const streetNumber = firstByTypes(components, ["street_number"]);
  const route = firstByTypes(components, ["route"]);
  const street = normalizeToken([streetNumber, route].filter(Boolean).join(" "));
  if (street) return street;
  return firstByTypes(components, ["premise", "subpremise"]);
}

function joinAreaLine(components: AddressComponent[]): string | null {
  const barangay = firstByTypes(components, ["sublocality_level_1", "sublocality", "neighborhood"]);
  const city = firstByTypes(components, [
    "locality",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ]);
  if (!barangay && !city) return null;
  if (!barangay) return city;
  if (!city) return barangay;
  if (tokenKey(barangay) === tokenKey(city)) return city;
  return `${barangay}, ${city}`;
}

export type PhFriendlyAddressInput = {
  components: AddressComponent[];
  placeName?: string | null;
};

export function buildPhFriendlyAddress({ components, placeName }: PhFriendlyAddressInput): string {
  const name = normalizeToken(placeName);
  const street = joinStreetLine(components);
  const area = joinAreaLine(components);

  const lines: string[] = [];
  if (name && !isGenericName(name, components)) {
    lines.push(name);
  }
  if (street) lines.push(street);
  if (area) lines.push(area);
  if (!street && !area && name) lines.push(name);
  return uniqueNonEmpty(lines).join("\n");
}

type NearbyCandidate = {
  placeId: string;
  distanceMeters: number;
};

export function pickNearestEstablishmentByDistance(
  marker: { lat: number; lng: number },
  places: google.maps.places.PlaceResult[]
): NearbyCandidate | null {
  const origin = new google.maps.LatLng(marker.lat, marker.lng);
  const ranked = places
    .map((place) => {
      const placeId = normalizeToken(place.place_id);
      const hasEstablishment = place.types?.includes("establishment") ?? false;
      const location = place.geometry?.location;
      const distanceMeters = location
        ? google.maps.geometry.spherical.computeDistanceBetween(location, origin)
        : Number.MAX_SAFE_INTEGER;
      return { placeId, hasEstablishment, distanceMeters };
    })
    .filter((row) => row.placeId.length > 0)
    .sort((a, b) => {
      if (a.hasEstablishment !== b.hasEstablishment) {
        return a.hasEstablishment ? -1 : 1;
      }
      return a.distanceMeters - b.distanceMeters;
    });

  if (!ranked[0]) return null;
  return { placeId: ranked[0].placeId, distanceMeters: ranked[0].distanceMeters };
}
