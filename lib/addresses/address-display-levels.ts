/**
 * ADDRESS DISPLAY LEVELS SSOT — Owner 2026-11-09 「주소 1단계(표시 통일)」.
 *
 * 주소 한 건(회원 대표 주소·매장 주소)을 화면에 보일 때는 이 파일의 3단계만 쓴다.
 * 예) 「Ra Cafe, 24k mansion, Sct. Tuason Street, Diliman, Quezon City, Metro Manila」
 *   ① 공개 지역  formatAddressPublicArea   → "Quezon City"            (홈·커뮤니티·거래·채팅·공개 프로필)
 *   ② 배달 지역  formatAddressDeliveryArea → "Diliman, Quezon City"   (배달 헤더·매장 카드·매장 상세 지역)
 *   ③ 전체 주소  formatAddressFullLines    → 장소, 도로, 바랑가이, 시 + 세부 줄 (결제·주문 배달 주소·매장 주소)
 *
 * 시/군 이름 = 거래 공개 도시와 같은 이름(`resolveTradeListingPublicCityLabel` — LGU id 기준), 없으면 저장된 시/군 글자.
 * Client-safe (서버 전용 LGU 데이터 미사용).
 */
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { resolveTradeListingPublicCityLabel } from "@/lib/posts/post-listing-location-label";
import { resolveTradeLguCityFromInternal } from "@/lib/trade/location/trade-lgu-city-rollup";
import { REGIONS } from "@/lib/products/form-options";

export type AddressDisplayParts = {
  /** 가게·장소 이름 (Ra Cafe) */
  placeName?: string | null;
  /** 도로·번지 (Sct. Tuason Street) */
  street?: string | null;
  /** 바랑가이 (Diliman) */
  barangay?: string | null;
  /** 시/군 LGU id (PSGC 또는 거래 rollup id) */
  cityLguId?: string | null;
  /** 시/군 이름 글자 — LGU id 로 이름을 못 찾을 때만 */
  cityText?: string | null;
  /** 세부(호수·층·건물 안) */
  detail?: string | null;
  /** 구조 칸이 비어 있는 예전 행 — Google 한 줄 주소 */
  fallbackLine?: string | null;
};

function clean(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "null" || lower === "undefined") return "";
  return t;
}

const PROVINCE_OR_COUNTRY_RE =
  /^(metro\s*manila|kalakhang\s*maynila|ncr|national\s*capital\s*region|philippines|필리핀|republic\s+of\s+the\s+philippines)$/i;

function sameToken(a: string, b: string): boolean {
  const k = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(barangay|brgy\.?)\s+/i, "")
      .replace(/^city of\s+/i, "")
      .replace(/\s+city$/i, "")
      .replace(/[^a-z0-9가-힣ñ]+/gi, "");
  const ka = k(a);
  const kb = k(b);
  return Boolean(ka) && ka === kb;
}

function isStreetLike(s: string): boolean {
  return (
    /\b(st\.?|street|ave\.?|avenue|rd\.?|road|blvd\.?|boulevard|drive|dr\.?|lane|ln\.?|highway|hwy\.?|extension|ext\.?)\b/i.test(s) ||
    /^\d+[a-z]?\s+\S+/i.test(s) ||
    /\+/.test(s)
  );
}

/** 바랑가이 표시 — 「Barangay Diliman」→「Diliman」, 숫자 바랑가이(「Barangay 171」)는 그대로 */
export function formatBarangayLabel(raw: string | null | undefined): string {
  const t = clean(raw);
  if (!t) return "";
  const stripped = t.replace(/^(barangay|brgy\.?)\s+/i, "").trim();
  if (!stripped) return "";
  return /[a-z가-힣]/i.test(stripped) ? stripped : t;
}

/** ① 시/군 이름 — LGU id 우선(거래와 같은 이름), 없으면 저장 글자 */
export function resolvePublicCityName(input: { cityLguId?: string | null; cityText?: string | null }): string | null {
  const id = clean(input.cityLguId);
  if (id) {
    const byId = resolveTradeListingPublicCityLabel({ tradeLguId: id });
    /** 전국 데이터 「City of Bacoor」 → 「Bacoor City」 (거래 rollup 「Makati City」와 같은 표기) */
    if (byId) return byId.replace(/^City of (.+)$/i, "$1 City");
  }
  const text = clean(input.cityText);
  if (!text || PROVINCE_OR_COUNTRY_RE.test(text) || /^(barangay|brgy\.?)\b/i.test(text)) return null;
  return text;
}

/** ① 공개 지역 — "Quezon City" */
export function formatAddressPublicArea(parts: AddressDisplayParts | null | undefined): string | null {
  if (!parts) return null;
  return resolvePublicCityName(parts);
}

/** ② 배달 지역 — "Diliman, Quezon City" (바랑가이 없으면 시/군만) */
export function formatAddressDeliveryArea(parts: AddressDisplayParts | null | undefined): string | null {
  if (!parts) return null;
  const city = resolvePublicCityName(parts);
  const brgy = formatBarangayLabel(parts.barangay);
  const out: string[] = [];
  if (brgy && !(city && sameToken(brgy, city)) && !PROVINCE_OR_COUNTRY_RE.test(brgy)) out.push(brgy);
  if (city) out.push(city);
  return out.length > 0 ? out.join(", ") : null;
}

/** ③ 전체 주소 — main: 장소, 도로, 바랑가이, 시/군 · detail: 세부 */
export function formatAddressFullLines(parts: AddressDisplayParts | null | undefined): {
  main: string | null;
  detail: string | null;
} {
  if (!parts) return { main: null, detail: null };
  const city = resolvePublicCityName(parts);
  const detail = clean(parts.detail) || null;
  const segs: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = clean(raw);
    if (!t) return;
    if (detail && sameToken(t, detail)) return;
    if (segs.some((s) => sameToken(s, t))) return;
    segs.push(t);
  };
  const hasStructured = Boolean(clean(parts.street) || clean(parts.barangay) || city);
  if (!hasStructured) {
    const fb = clean(parts.fallbackLine)
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter((x) => x && !PROVINCE_OR_COUNTRY_RE.test(x) && !/^\d{4}(\s+\D.*)?$/.test(x));
    push(parts.placeName);
    for (const s of fb) push(s);
    return { main: segs.join(", ") || null, detail };
  }
  push(parts.placeName);
  push(parts.street);
  push(formatBarangayLabel(parts.barangay));
  push(city);
  return { main: segs.join(", ") || null, detail };
}

/** ③ 한 줄 — "세부 · 장소, 도로, 바랑가이, 시" 가 아니라 main 뒤에 세부를 붙이지 않는다(세부는 따로 줄) */
export function formatAddressFullOneLine(parts: AddressDisplayParts | null | undefined): string | null {
  const { main, detail } = formatAddressFullLines(parts);
  return [detail, main].filter(Boolean).join(", ") || null;
}

/* ───────── 입력 어댑터 ───────── */

/** 저장된 building_name 이 실제 장소 이름일 때만 (도로와 같거나 국가·지역이면 제외) — canonical-address-display 와 같은 규칙(순환 import 회피용 사본) */
function placeNameFromStoredBuilding(buildingName: string | null | undefined, streetAddress: string | null | undefined): string | null {
  const b = clean(buildingName);
  if (!b) return null;
  const street = clean(streetAddress);
  if (street && sameToken(b, street)) return null;
  if (/^(unnamed road|philippines|필리핀|metro manila)$/i.test(b)) return null;
  return b;
}

/** 회원 주소(대표 주소) → 표시 칸 */
export function addressDisplayPartsFromUserAddress(a: UserAddressDTO | null | undefined): AddressDisplayParts | null {
  if (!a?.id) return null;
  const detailParts: string[] = [];
  for (const raw of [a.unitFloorRoom, a.detailAddress]) {
    const t = clean(raw);
    if (t && !detailParts.some((d) => sameToken(d, t))) detailParts.push(t);
  }
  return {
    placeName: placeNameFromStoredBuilding(a.buildingName, a.streetAddress),
    street: clean(a.streetAddress) || null,
    barangay: clean(a.barangay) || clean(a.neighborhoodName) || null,
    cityLguId: clean(a.canonicalLguId) || null,
    cityText: clean(a.cityMunicipality) || clean(a.locationCityMunicipality) || null,
    detail: detailParts.join(", ") || null,
    fallbackLine: clean(a.formattedAddress) || clean(a.fullAddress) || clean(a.roadAddress) || null,
  };
}

type StoreLocationRow = {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  formatted_address?: string | null;
  detail_address?: string | null;
};

function taxonomyPair(regionRaw: string, cityRaw: string): { regionId: string; cityId: string; cityName: string } | null {
  const region = REGIONS.find((r) => r.id === regionRaw) ?? REGIONS.find((r) => r.name === regionRaw);
  if (!region) return null;
  const city = region.cities.find((c) => c.id === cityRaw) ?? region.cities.find((c) => c.name === cityRaw);
  if (!city) return null;
  return { regionId: region.id, cityId: city.id, cityName: city.name };
}

/** 매장 주소에서 바랑가이 — Google 형식 「…, <바랑가이>, <시>, …」의 시 바로 앞 칸 */
function barangayBeforeCity(line: string, city: string): string | null {
  const segs = line
    .split(/[,\n]/)
    .map((x) => clean(x))
    .filter(Boolean);
  const idx = segs.findIndex((s) => sameToken(s, city));
  if (idx <= 0) return null;
  const prev = segs[idx - 1]!;
  if (isStreetLike(prev) || PROVINCE_OR_COUNTRY_RE.test(prev)) return null;
  return prev;
}

/**
 * 매장 행 → 표시 칸.
 * 매장 지역 칸은 두 형식이 섞여 있다(운영 확인 2026-11-09):
 *  - 오너 폼: region=「Quezon City」·city=「Diliman」(앱 동네 목록 이름/ID)
 *  - Google: region=「Metro Manila」(도)·city=「Quezon City」(시/군)
 * 둘 다 같은 ①②③ 결과가 나오게 여기서만 해석한다. (3단계에서 매장에 바랑가이·LGU 칸을 두면 이 해석은 없어진다)
 */
export function addressDisplayPartsFromStoreRow(row: StoreLocationRow | null | undefined): AddressDisplayParts | null {
  if (!row) return null;
  const region = clean(row.region);
  const cityRaw = clean(row.city);
  const line1 = clean(row.address_line1);
  const formatted = clean(row.formatted_address);
  const detail = clean(row.address_line2) || clean(row.detail_address) || null;

  let cityLguId: string | null = null;
  let cityText: string | null = null;
  let barangay: string | null = null;

  const tax = region && cityRaw ? taxonomyPair(region, cityRaw) : null;
  if (tax) {
    const lgu = resolveTradeLguCityFromInternal(tax.regionId, tax.cityId);
    cityLguId = lgu?.id ?? null;
    cityText = lgu?.displayName ?? null;
    const area = tax.cityName.includes("–") ? tax.cityName.split("–").pop()!.trim() : tax.cityName;
    if (!cityText || !sameToken(area, cityText)) barangay = area;
  } else {
    cityText = cityRaw || null;
  }
  if (cityText) {
    const fromText = barangayBeforeCity(formatted, cityText) ?? barangayBeforeCity(`${line1}, ${cityText}`, cityText);
    if (fromText) barangay = fromText;
  }

  const street = line1
    .split(",")
    .map((x) => clean(x))
    .filter((x) => x && !(barangay && sameToken(x, barangay)) && !(cityText && sameToken(x, cityText)) && !PROVINCE_OR_COUNTRY_RE.test(x))
    .join(", ");

  return {
    placeName: null,
    street: street || null,
    barangay,
    cityLguId,
    cityText,
    detail,
    fallbackLine: formatted || null,
  };
}
