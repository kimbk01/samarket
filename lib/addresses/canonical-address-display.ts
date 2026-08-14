import { isLocationOnlyAddressNickname } from "@/lib/addresses/location-only-address-nickname";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";

export type CanonicalDisplayInput = {
  userLabel?: string | null;
  placeName?: string | null;
  neighborhoodName?: string | null;
  streetAddress?: string | null;
  route?: string | null;
  barangay?: string | null;
  cityMunicipality?: string | null;
  province?: string | null;
  formattedAddress?: string | null;
  detail?: string | null;
  landmark?: string | null;
  deliveryNote?: string | null;
};

/** Snapshot / header resolvers — title no longer uses 집/회사; labels stay for shop nickname helpers. */
export const CANONICAL_DISPLAY_LABELS_FALLBACK = {
  home: "집",
  office: "회사",
  shop: "매장",
} as const;

export type CanonicalDisplayLines = {
  title: string;
  addressLine: string;
  detailLine: string | null;
};

function clean(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return "";
  return t;
}

function sameToken(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function uniqueJoin(parts: Array<string | null | undefined>): string {
  const out: string[] = [];
  for (const p of parts) {
    const t = clean(p);
    if (!t) continue;
    if (out.some((x) => sameToken(x, t))) continue;
    out.push(t);
  }
  return out.join(", ");
}

function formattedHeadline(formatted: string | null | undefined): string {
  const stripped = stripCountryFromAddressDisplayLine(clean(formatted), "Philippines") || clean(formatted);
  if (!stripped) return "";
  return stripped.split(",")[0]?.trim() || stripped;
}

function areaLine(input: CanonicalDisplayInput): string {
  const barangay = clean(input.barangay);
  const brgy =
    barangay && !/^(barangay|brgy\.?)\b/i.test(barangay) ? `Barangay ${barangay}` : barangay;
  return uniqueJoin([brgy, input.cityMunicipality, input.province]);
}

/**
 * FULL title — not a DB field.
 * place/building → Subdivision/Village → street → route → formatted headline.
 * Custom nicknames and 집/회사 stay as badges, not the title.
 */
export function resolveAddressBookTitle(input: CanonicalDisplayInput): string {
  const place = clean(input.placeName);
  if (place) return place;
  const neighborhood = clean(input.neighborhoodName);
  if (neighborhood) return neighborhood;
  const street = clean(input.streetAddress);
  if (street) return street;
  const route = clean(input.route);
  if (route) return route;
  const head = formattedHeadline(input.formattedAddress);
  if (head) return head;
  return "";
}

/**
 * SHORT chip — 상호/건물명, else Subdivision/Village.
 * Never return blank for a saved master row that has a street/formatted headline.
 * Does not use city-only public labels, detail, or deliveryNote.
 */
export function resolveCanonicalChipLine(input: CanonicalDisplayInput): string {
  const place = clean(input.placeName);
  if (place) return place;
  const neighborhood = clean(input.neighborhoodName);
  if (neighborhood) return neighborhood;
  return resolveAddressBookTitle(input);
}

/**
 * Line under title. Does not repeat the title token.
 */
export function resolveAddressBookAddressLine(input: CanonicalDisplayInput): string {
  const title = resolveAddressBookTitle(input);
  const place = clean(input.placeName);
  const street = clean(input.streetAddress);
  const area = areaLine(input);
  const parts: string[] = [];
  if (place && (!title || !sameToken(place, title))) parts.push(place);
  if (street && (!title || !sameToken(street, title))) parts.push(street);
  if (area) {
    for (const bit of area.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (title && sameToken(bit, title)) continue;
      if (parts.some((p) => sameToken(p, bit))) continue;
      parts.push(bit);
    }
  }
  if (parts.length > 0) return parts.join(", ");
  const formatted = stripCountryFromAddressDisplayLine(clean(input.formattedAddress), "Philippines") || clean(input.formattedAddress);
  if (formatted && title && formatted.toLowerCase().startsWith(title.toLowerCase())) {
    const rest = formatted.slice(title.length).replace(/^[\s,]+/, "").trim();
    if (rest) return rest;
  }
  if (formatted && (!title || !sameToken(formatted, title))) return formatted;
  return "";
}

export function resolveAddressBookDetailLine(input: CanonicalDisplayInput): string | null {
  const line = uniqueJoin([input.detail, input.landmark]);
  return line || null;
}

export function resolveCanonicalDisplayLines(input: CanonicalDisplayInput): CanonicalDisplayLines {
  return {
    title: resolveAddressBookTitle(input),
    addressLine: resolveAddressBookAddressLine(input),
    detailLine: resolveAddressBookDetailLine(input),
  };
}

export function formatCanonicalFullLine(input: CanonicalDisplayInput): string {
  const lines = resolveCanonicalDisplayLines(input);
  return uniqueJoin([lines.detailLine, lines.title, lines.addressLine]);
}

export function displayInputFromDraft(
  draft: CanonicalAddressDraft,
  extra?: { userLabel?: string | null; detail?: string | null; landmark?: string | null; deliveryNote?: string | null },
): CanonicalDisplayInput {
  return {
    userLabel: extra?.userLabel ?? null,
    placeName: draft.placeName,
    neighborhoodName: draft.neighborhoodName,
    streetAddress: draft.streetAddress,
    route: draft.route,
    barangay: draft.barangay,
    cityMunicipality: draft.cityMunicipality,
    province: draft.province,
    formattedAddress: draft.formattedAddress,
    detail: extra?.detail ?? null,
    landmark: extra?.landmark ?? null,
    deliveryNote: extra?.deliveryNote ?? null,
  };
}

export function realPlaceNameFromStoredBuilding(
  buildingName: string | null | undefined,
  streetAddress: string | null | undefined,
): string | null {
  const b = clean(buildingName);
  if (!b) return null;
  const street = clean(streetAddress);
  if (street && sameToken(b, street)) return null;
  if (/^(unnamed road|philippines|필리핀|metro manila)$/i.test(b)) return null;
  return b;
}

export function userLabelFromDto(
  row: UserAddressDTO,
  labels: { home: string; office: string; shop: string },
  storeName?: string | null,
): string | null {
  if (row.labelType === "shop") {
    const store = clean(storeName);
    return store || labels.shop;
  }
  const nick = row.nickname?.trim() ?? "";
  if (isLocationOnlyAddressNickname(nick)) {
    if (row.labelType === "home") return labels.home;
    if (row.labelType === "office") return labels.office;
    return null;
  }
  if (nick && nick.toLowerCase() !== "null" && nick.toLowerCase() !== "undefined") return nick;
  if (row.labelType === "home") return labels.home;
  if (row.labelType === "office") return labels.office;
  return null;
}

export function displayInputFromDto(
  row: UserAddressDTO,
  labels: { home: string; office: string; shop: string },
  storeName?: string | null,
): CanonicalDisplayInput {
  const detail = uniqueJoin([row.unitFloorRoom, row.detailAddress]);
  return {
    userLabel: userLabelFromDto(row, labels, storeName),
    placeName: realPlaceNameFromStoredBuilding(row.buildingName, row.streetAddress),
    neighborhoodName: row.neighborhoodName,
    streetAddress: row.streetAddress,
    route: null,
    barangay: row.barangay,
    cityMunicipality: row.cityMunicipality,
    province: row.province,
    formattedAddress: row.formattedAddress || row.roadAddress || row.fullAddress,
    detail: detail || null,
    landmark: row.landmark,
    deliveryNote: row.deliveryNote,
  };
}

export function resolveCanonicalChipLineFromDto(
  row: UserAddressDTO,
  labels: { home: string; office: string; shop: string } = CANONICAL_DISPLAY_LABELS_FALLBACK,
  storeName?: string | null,
): string {
  return resolveCanonicalChipLine(displayInputFromDto(row, labels, storeName));
}

export function formatCanonicalFullLineFromDto(
  row: UserAddressDTO,
  labels: { home: string; office: string; shop: string } = CANONICAL_DISPLAY_LABELS_FALLBACK,
  storeName?: string | null,
): string {
  return formatCanonicalFullLine(displayInputFromDto(row, labels, storeName));
}

export function labelTypeFromPreset(preset: "home" | "office" | "other"): UserAddressLabelType {
  return preset;
}
