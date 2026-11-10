import { isLocationOnlyAddressNickname } from "@/lib/addresses/location-only-address-nickname";
import { formatAddressFullLines } from "@/lib/addresses/address-display-levels";
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
  /** 저장된 시/군 LGU(PSGC) — 있으면 시/군 이름을 주소 표시 SSOT 와 같은 이름으로 */
  cityLguId?: string | null;
  /** 주소 나라 — 한국(KR)은 도로명 한 줄 표시 */
  country?: "PH" | "KR" | null;
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

export function formattedHeadline(formatted: string | null | undefined): string {
  const stripped = stripCountryFromAddressDisplayLine(clean(formatted), "Philippines") || clean(formatted);
  if (!stripped) return "";
  /**
   * 주소 SSOT 5단계: 한국어 순서 한 줄 주소(「필리핀 1008 Metro Manila, Manila, …」) — 국가·우편번호(+도)만인 구간은 제목으로 쓰지 않는다
   */
  const segs = stripped
    .split(",")
    .map((x) => x.trim().replace(/^(필리핀|philippines)\s+/i, "").trim())
    .filter(
      (x) =>
        x &&
        !/^\d{4}(\s+(metro\s*manila|kalakhang\s*maynila|ncr))?$/i.test(x) &&
        !/^(metro\s*manila|kalakhang\s*maynila|ncr|philippines|필리핀)$/i.test(x),
    );
  return segs[0] ?? (stripped.split(",")[0]?.trim() || stripped);
}

/**
 * FULL title — not a DB field.
 * place/building → street/road → Barangay → Subdivision/Village → formatted headline.
 * Custom nicknames and 집/회사 stay as badges, not the title.
 */
export function resolveAddressBookTitle(input: CanonicalDisplayInput): string {
  const place = clean(input.placeName);
  if (place) return place;
  const street = clean(input.streetAddress);
  if (street) return street;
  const route = clean(input.route);
  if (route) return route;
  const barangay = clean(input.barangay);
  if (barangay) return /^(barangay|brgy\.?)\b/i.test(barangay) ? barangay : `Barangay ${barangay}`;
  const neighborhood = clean(input.neighborhoodName);
  if (neighborhood) return neighborhood;
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
 * 주소 SSOT 5단계 (2026-11-09): ③ 전체 주소(`formatAddressFullLines` — 장소, 도로, 바랑가이, 시/군)에서 제목 구간만 뺀 줄.
 * 이전: 따로 「Barangay …, 시, 도」를 이어 붙이거나 Google 한 줄 주소를 그대로 써서
 * 주소관리 목록에 「…, Manila, 1001 Metro Manila」(도·우편번호)가 남고 결제·주소록 문장과 달랐다.
 */
export function resolveAddressBookAddressLine(input: CanonicalDisplayInput): string {
  const title = resolveAddressBookTitle(input);
  const { main } = formatAddressFullLines({
    placeName: input.placeName,
    street: clean(input.streetAddress) || clean(input.route) || null,
    barangay: clean(input.barangay) || clean(input.neighborhoodName) || null,
    cityLguId: input.cityLguId ?? null,
    cityText: input.cityMunicipality ?? null,
    fallbackLine: input.formattedAddress ?? null,
    country: input.country ?? null,
  });
  if (!main) return "";
  const parts = main
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const rest = title ? parts.filter((p) => !sameTokenLoose(p, title)) : parts;
  return rest.join(", ");
}

/** 제목 구간 비교 — 「Barangay Diliman」/「Diliman」 같은 표기를 같은 구간으로 본다 */
function sameTokenLoose(a: string, b: string): boolean {
  const k = (x: string) => x.trim().toLowerCase().replace(/^(barangay|brgy\.?)\s+/i, "");
  return k(a) === k(b);
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
    country: draft.countryCode === "KR" ? "KR" : "PH",
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
    cityLguId: row.canonicalLguId ?? null,
    country: (row.countryCode ?? "PH").trim().toUpperCase() === "KR" ? "KR" : "PH",
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
