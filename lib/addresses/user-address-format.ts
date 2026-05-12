import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { formatPhDetailThenStreetFromParts } from "@/lib/stores/store-location-label";
import { getLocationLabelIfValid, REGIONS } from "@/lib/products/form-options";

/**
 * 타인에게 보이는 거래 동네 한 줄 — 상세 도로명·fullAddress 는 제외.
 * (물품 상세 판매자 줄·프로필 「거래 주소」와 맞춤)
 */
export function buildTradeLocationPreviewForPublic(a: UserAddressDTO | null | undefined): string | null {
  if (!a) return null;
  const nn = a.neighborhoodName?.trim();
  if (nn) return nn;
  const rid = a.appRegionId?.trim() ?? "";
  const cid = a.appCityId?.trim() ?? "";
  if (rid && cid && rid.toLowerCase() !== "null" && cid.toLowerCase() !== "null") {
    const valid = getLocationLabelIfValid(rid, cid);
    if (valid) return valid;
  }
  const parts = [a.barangay, a.cityMunicipality, a.province].filter(
    (x) => x?.trim() && x.trim().toLowerCase() !== "null",
  );
  const line = parts.join(", ").trim();
  return line || null;
}

/** `parseFullAddressThroughCityLine` 등에서 앞 구간이 도로·번지로 남은 경우 제거 */
function stripStreetLikeLeadingCommaSegments(line: string): string {
  const parts = line.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return line.trim();
  const isStreetLike = (p: string) => {
    const t = p.trim();
    if (/^\d+[\s-]/.test(t)) return true;
    if (/^\d+\s/.test(t) && /\b(st|street|ave|avenue|rd|blvd|road|hwy|highway|way|drive|dr)\b/i.test(t)) {
      return true;
    }
    if (/\b(st|street|ave|avenue|rd|blvd|road|hwy|highway|way|drive|dr)\b/i.test(t)) return true;
    return false;
  };
  while (parts.length > 1 && isStreetLike(parts[0])) {
    parts.shift();
  }
  return parts.join(", ").trim();
}

/**
 * 필라이프·1단 탐색 헤더 등 — **도로·번지 없이** 바랑가이·시·주 등 지역만.
 * `buildTradePublicLine` 과 달리 `fullAddress`는 말미 구간만 파싱해 쓰며, 상세 주소는 주소 관리에만 둔다.
 */
export function buildExplorationRegionSubtitleLine(a: UserAddressDTO | null | undefined): string | null {
  if (!a) return null;

  const preview = buildTradeLocationPreviewForPublic(a);
  if (preview?.trim()) {
    const s = stripCountryFromAddressDisplayLine(preview.trim(), a.countryName).trim();
    if (s) return s;
  }

  const fromIds = tradePublicLineFromAppLocationIds(a);
  if (fromIds?.trim()) {
    const s = stripCountryFromAddressDisplayLine(fromIds.trim(), a.countryName).trim();
    if (s) return s;
  }

  const fa = a.fullAddress?.trim();
  if (fa && !isDisplayNullish(fa)) {
    const parsed = parseFullAddressThroughCityLine(fa);
    if (parsed?.trim()) {
      const cleaned = stripStreetLikeLeadingCommaSegments(parsed.trim());
      const s = stripCountryFromAddressDisplayLine(cleaned, a.countryName).trim();
      if (s) return s;
    }
  }

  const tail = [a.barangay, a.district, a.cityMunicipality, a.province].filter(
    (x) => x?.trim() && !isDisplayNullish(x),
  ) as string[];
  if (tail.length) {
    const s = stripCountryFromAddressDisplayLine(tail.join(", "), a.countryName).trim();
    if (s) return s;
  }

  return null;
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

/**
 * `fullAddress`에서 주소관리·헤더에 쓰는 **체크 구간**(도로·동네 ~ 시, 우편·꼬리 제외) 한 줄.
 * 예: `170 Commonwealth Ave, Quezon City` / `Quiapo, Manila` / `Rizal St, Cebu City`
 */
function parseFullAddressThroughCityLine(full: string): string | null {
  let s = full.trim();
  s = s.replace(/\s*\(\s*[\d\s+-]{5,}\s*\)\s*$/, "").trim();
  let parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const dropTail = (p: string) => {
    const l = p.toLowerCase();
    if (/\bmetro\s+manila\b/i.test(p)) return true;
    if (/^\d{3,5}\s*metro\s+manila$/i.test(l)) return true;
    if (/^ncr$/i.test(l)) return true;
    if (/^philippines$/i.test(l)) return true;
    if (/^필리핀$/i.test(p)) return true;
    return false;
  };

  parts = parts.filter((p) => !dropTail(p));
  while (parts.length >= 2) {
    const last = parts[parts.length - 1].trim();
    const prev = parts[parts.length - 2].trim();
    const ll = last.toLowerCase();
    const pl = prev.toLowerCase();
    if (last.length <= 12 && pl.includes(ll) && pl !== ll) {
      parts.pop();
      continue;
    }
    break;
  }

  const isBlockLot = (p: string) => /^blk\.?\s|^block\s|^lot\s/i.test(p.trim());
  while (parts.length && isBlockLot(parts[0])) {
    parts.shift();
  }

  const isStripHead = (p: string) => {
    const t = p.trim();
    if (/^\d+[\s-]+\d+\s*$/.test(t)) return true;
    if (/^\d+\s/.test(t) && /\b(st|street|ave|avenue|rd|blvd|road|hwy|highway)\b/i.test(t)) return true;
    return false;
  };
  while (parts.length > 2 && isStripHead(parts[0])) {
    parts.shift();
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join(", ");
}

/** 앱 지역 ID → `세부(에어리어), 광역(시)` — 예: Quiapo, Manila */
function tradePublicLineFromAppLocationIds(a: UserAddressDTO): string | null {
  if (!a.appRegionId || !a.appCityId || isDisplayNullish(a.appRegionId) || isDisplayNullish(a.appCityId)) {
    return null;
  }
  if (!getLocationLabelIfValid(a.appRegionId, a.appCityId)) return null;
  const region = REGIONS.find((r) => r.id === a.appRegionId);
  const city = region?.cities.find((c) => c.id === a.appCityId);
  const cityName = city?.name?.trim() ?? "";
  const regionName = region?.name?.trim() ?? "";
  if (cityName && regionName) {
    const br =
      (a.barangay?.trim() && !isDisplayNullish(a.barangay) ? a.barangay.trim() : "") ||
      (a.district?.trim() && !isDisplayNullish(a.district) ? a.district.trim() : "");
    if (br && br.toLowerCase() !== cityName.toLowerCase()) {
      return `${br}, ${cityName}`;
    }
    return `${cityName}, ${regionName}`;
  }
  return getLocationLabelIfValid(a.appRegionId, a.appCityId);
}

/**
 * 목록 회색 줄·상단 헤더 — **체크한 구간**(세부~시). `fullAddress` 우선 파싱, 없으면 필드·지역 ID.
 */
export function buildTradePublicLine(a: UserAddressDTO): string {
  const road = a.roadAddress?.trim() || a.formattedAddress?.trim();
  if (road && !isDisplayNullish(road)) {
    return stripCountryFromAddressDisplayLine(road, a.countryName);
  }
  const fa = a.fullAddress?.trim();
  if (fa && !isDisplayNullish(fa)) {
    const parsed = parseFullAddressThroughCityLine(fa);
    if (parsed) return parsed;
  }

  const fromIds = tradePublicLineFromAppLocationIds(a);
  if (fromIds) return fromIds;

  const chunks = [
    a.streetAddress,
    a.barangay,
    a.district,
    a.cityMunicipality,
  ].filter((x) => x?.trim() && !isDisplayNullish(x)) as string[];
  if (chunks.length >= 2) return chunks.join(", ");
  if (chunks.length === 1) return chunks[0];

  const rid = a.appRegionId?.trim() ?? "";
  const cid = a.appCityId?.trim() ?? "";
  if (rid && cid && !isDisplayNullish(rid) && !isDisplayNullish(cid)) {
    const valid = getLocationLabelIfValid(rid, cid);
    if (valid) return valid;
  }

  const fallback = [
    a.unitFloorRoom,
    a.buildingName,
    a.province,
    a.neighborhoodName,
  ].filter((x) => x?.trim() && !isDisplayNullish(x)) as string[];
  if (fallback.length > 0) return [...chunks, ...fallback].join(", ");

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

export function buildDeliveryDetailLines(a: UserAddressDTO): string {
  const lines: string[] = [];
  if (a.detailAddress?.trim()) lines.push(a.detailAddress.trim());
  // Philippines-friendly order: unit/building first, then street/full address.
  const unit = [a.unitFloorRoom, a.buildingName].filter((x) => x?.trim()).join(" ").trim();
  if (unit && !lines.some((x) => x.toLowerCase().includes(unit.toLowerCase()))) lines.push(unit);

  const full = a.formattedAddress?.trim() || a.fullAddress?.trim() || "";
  const street = a.streetAddress?.trim() ?? "";
  const main = full || street;
  if (main) {
    // Avoid duplicating unit if it was already included in the full line.
    if (!unit || !main.toLowerCase().includes(unit.toLowerCase())) {
      lines.push(main);
    }
  } else {
    const parts = [a.barangay, a.cityMunicipality, a.province]
      .map((x) => x?.trim())
      .filter((x) => x && !isDisplayNullish(x)) as string[];
    if (parts.length) lines.push(parts.join(", "));
  }
  if (a.landmark?.trim()) lines.push(`Landmark: ${a.landmark.trim()}`);
  return lines.join("\n");
}

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
  return {
    user_address_id: a.id,
    place_id: a.placeId,
    recipient_name: a.recipientName,
    phone: a.phoneNumber,
    app_region_id: a.appRegionId,
    app_city_id: a.appCityId,
    summary_line: buildTradePublicLine(a),
    address_detail: a.detailAddress?.trim() || buildDeliveryDetailLines(a),
    delivery_note: a.deliveryNote,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}
