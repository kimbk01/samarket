import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { formatPhAddressCardOneLine } from "@/lib/addresses/ph-address-display";
import { buildPublicAllowListAddressLine } from "@/lib/addresses/public-address-allow-list";
import { formatPhDetailThenStreetFromParts } from "@/lib/stores/store-location-label";

/**
 * PUBLIC ADDRESS SSOT — Community / Trade / open surfaces.
 * City / Municipality ONLY (PH product contract).
 */
export function formatPublicAddress(a: UserAddressDTO | null | undefined): string | null {
  return buildPublicAllowListAddressLine(a);
}

/**
 * 타인에게 보이는 거래 동네 한 줄 — PUBLIC SSOT.
 */
export function buildTradeLocationPreviewForPublic(a: UserAddressDTO | null | undefined): string | null {
  return formatPublicAddress(a);
}

/**
 * 필라이프·1단 탐색 헤더 등 — PUBLIC City/Municipality only.
 */
export function buildExplorationRegionSubtitleLine(a: UserAddressDTO | null | undefined): string | null {
  return formatPublicAddress(a);
}

function isDisplayNullish(s: string | null | undefined): boolean {
  const t = s?.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  return lower === "null" || lower === "undefined";
}

/**
 * 표시용 한 줄 주소 끝의 국가(필리핀·Philippines 등)를 제거 — 목록·프로필에서 국가는 숨김.
 * `countryName`은 DB 값과 별도로 흔한 필리핀 표기도 함께 시도합니다.
 */
export function stripCountryFromAddressDisplayLine(line: string, countryName?: string | null): string {
  let t = line.trim();
  if (!t) return t;
  const extras = [
    ...(countryName?.trim() ? [countryName.trim()] : []),
    "필리핀",
    "Philippines",
    "the Philippines",
    "Republic of the Philippines",
  ];
  const seen = new Set<string>();
  const names = extras
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => {
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.length - a.length);

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const withComma = new RegExp(`[,，]\\s*${escaped}\\s*$`, "i");
      const withSpace = new RegExp(`\\s+${escaped}\\s*$`, "i");
      let n = t.replace(withComma, "").trim();
      if (n !== t) {
        t = n;
        changed = true;
        break;
      }
      n = t.replace(withSpace, "").trim();
      if (n !== t) {
        t = n;
        changed = true;
        break;
      }
    }
  }
  return t.replace(/[,，]\s*$/, "").trim();
}

/** 앱 지역 ID → City/Municipality public label (taxonomy leading token). */
function tradePublicLineFromAppLocationIds(a: UserAddressDTO): string | null {
  return buildPublicAllowListAddressLine({
    ...a,
    cityMunicipality: null,
  });
}

/**
 * 거래 공개 한 줄 — City/Municipality ONLY.
 */
export function buildTradePublicLine(a: UserAddressDTO): string {
  const allow = formatPublicAddress(a);
  if (allow?.trim()) return allow.trim();

  const fromIds = tradePublicLineFromAppLocationIds(a);
  if (fromIds?.trim()) return fromIds.trim();

  if (a.latitude != null && a.longitude != null) {
    return `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`;
  }
  return "주소 미입력";
}

/**
 * 주소 관리 목록 등 — 본문(`mainLine`) 아래에 붙일 상세(건물명·동·호).
 * 이미 본문 문자열에 포함된 경우는 중복이므로 생략합니다.
 * `detailAddress`·`unitFloorRoom`·`buildingName`에 동일 문자열이 여러 번 들어가면(매장 스냅샷 등) **첫 한 번**만 남깁니다.
 */
export function buildAddressListDetailLine(a: UserAddressDTO, mainLine: string): string | null {
  const ml = mainLine.trim().toLowerCase();
  const raw = [a.detailAddress, a.unitFloorRoom, a.buildingName]
    .map((x) => x?.trim())
    .filter((x) => x && !isDisplayNullish(x)) as string[];

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of raw) {
    const pl = p.toLowerCase();
    if (seen.has(pl)) continue;
    seen.add(pl);
    deduped.push(p);
  }

  const parts = deduped.filter((p) => {
    const pl = p.toLowerCase();
    if (!pl) return false;
    return !ml.includes(pl);
  });

  if (!parts.length) return null;
  const line = parts.join(" · ").trim();
  if (!line) return null;
  if (ml.includes(line.toLowerCase())) return null;
  return line;
}

/**
 * DELIVERY ADDRESS SSOT — PH full deliverable address.
 *
 * Order:
 * Unit/Room/Floor → Street → Subdivision/Building → Barangay → City → Postal+Province → Country
 * Empty fields omitted (no blank lines). Prefer structured fields over formatted dump.
 */
export function buildDeliveryDetailLines(a: UserAddressDTO): string {
  const lines: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = raw?.replace(/\s+/g, " ").trim();
    if (!t || isDisplayNullish(t)) return;
    const lower = t.toLowerCase();
    if (lines.some((x) => x.toLowerCase() === lower)) return;
    lines.push(t);
  };

  const unit = (a.unitFloorRoom?.trim() || a.detailAddress?.trim() || "") || "";
  push(unit);

  push(a.streetAddress);

  // Subdivision / Village / Building — prefer buildingName, then landmark (not delivery_note).
  const subdivisionOrBuilding = a.buildingName?.trim() || a.landmark?.trim() || "";
  if (subdivisionOrBuilding) {
    const uLower = unit.toLowerCase();
    if (!uLower || !subdivisionOrBuilding.toLowerCase().includes(uLower)) {
      push(subdivisionOrBuilding);
    }
  }

  const barangay = a.barangay?.trim();
  if (barangay) {
    push(/^barangay\b/i.test(barangay) || /^brgy\.?\b/i.test(barangay) ? barangay : `Barangay ${barangay}`);
  }

  push(a.cityMunicipality);

  const province = a.province?.trim();
  if (province) push(province);

  const country = (a.countryName?.trim() || (a.countryCode?.toUpperCase() === "PH" ? "PHILIPPINES" : "")).trim();
  if (country) {
    push(/philippines/i.test(country) ? "PHILIPPINES" : country);
  }

  if (lines.length > 0) return lines.join("\n");

  const fallback =
    a.formattedAddress?.trim() ||
    a.fullAddress?.trim() ||
    a.roadAddress?.trim() ||
    "";
  return fallback ? stripCountryFromAddressDisplayLine(fallback, a.countryName) : "";
}

/** DELIVERY ADDRESS SSOT — detail/unit allowed. */
export function formatDeliveryAddress(a: UserAddressDTO): string {
  return buildDeliveryDetailLines(a);
}

export {
  formatAddressBookLine,
  formatAddressBookLineSegments,
  type AddressBookLineSegments,
} from "@/lib/addresses/address-book-line";

/**
 * 주소 관리 카드 본문 — **전체 주소** 한 줄 (헤더·거래 요약용 `buildTradePublicLine` 과 별개).
 * 매장 `위치안내`와 **동일**하게 `formatPhDetailThenStreetFromParts` 로 상세·구글가로·바랑가이 dedupe.
 */
export function buildAddressManagementListPrimaryLine(a: UserAddressDTO): string {
  const unit = [a.unitFloorRoom, a.buildingName].filter((x) => x?.trim()).join(" ").trim();
  const fa = a.formattedAddress?.trim() || a.fullAddress?.trim() || "";
  if (fa && !isDisplayNullish(fa)) {
    const unitInFa = unit.length > 0 && fa.toLowerCase().includes(unit.toLowerCase());
    const barOrDist = a.barangay?.trim() || a.district?.trim() || null;
    return formatPhDetailThenStreetFromParts({
      address_line1: fa,
      address_line2: unitInFa ? null : unit || null,
      district: barOrDist,
    });
  }
  const trade = buildTradePublicLine(a);
  if (trade !== "주소 미입력") return trade;
  const street = (a.streetAddress ?? "").trim();
  if (street) {
    const unitInStreet = unit.length > 0 && street.toLowerCase().includes(unit.toLowerCase());
    const barOrDist = a.barangay?.trim() || a.district?.trim() || null;
    return formatPhDetailThenStreetFromParts({
      address_line1: street,
      address_line2: unitInStreet ? null : unit || null,
      district: barOrDist,
    });
  }
  const detail = buildDeliveryDetailLines(a).trim();
  if (detail) return detail.replace(/\n/g, ", ");
  return trade;
}

export type CheckoutDeliveryPayload = {
  user_address_id: string;
  place_id: string | null;
  recipient_name: string | null;
  phone: string | null;
  app_region_id: string | null;
  app_city_id: string | null;
  summary_line: string;
  address_detail: string;
  delivery_note: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function toCheckoutDeliveryPayload(a: UserAddressDTO): CheckoutDeliveryPayload {
  const isPh = (a.countryCode ?? "PH").trim().toUpperCase() === "PH";
  let summary_line: string;
  let address_detail: string;

  if (isPh) {
    const ph = formatPhAddressCardOneLine(a);
    summary_line = ph.streetBody || buildTradePublicLine(a);
    address_detail = ph.gatePrefix || a.detailAddress?.trim() || "";
  } else {
    summary_line = buildAddressManagementListPrimaryLine(a);
    const main = summary_line.trim();
    address_detail =
      buildAddressListDetailLine(a, main) || a.detailAddress?.trim() || a.unitFloorRoom?.trim() || "";
  }

  return {
    user_address_id: a.id,
    place_id: a.placeId,
    recipient_name: a.recipientName,
    phone: a.phoneNumber,
    app_region_id: a.appRegionId,
    app_city_id: a.appCityId,
    summary_line,
    address_detail,
    delivery_note: a.deliveryNote,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}
