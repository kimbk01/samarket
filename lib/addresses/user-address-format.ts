import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
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
 */
export function buildAddressListDetailLine(a: UserAddressDTO, mainLine: string): string | null {
  const parts = [a.buildingName, a.unitFloorRoom]
    .map((x) => x?.trim())
    .filter((x) => x && !isDisplayNullish(x));
  const line = parts.join(" ").trim();
  if (!line) return null;
  const ml = mainLine.trim().toLowerCase();
  const ll = line.toLowerCase();
  if (ml.includes(ll)) return null;
  return line;
}

export function buildDeliveryDetailLines(a: UserAddressDTO): string {
  const lines: string[] = [];
  if (a.fullAddress?.trim()) {
    lines.push(a.fullAddress.trim());
  } else if (a.streetAddress?.trim()) {
    lines.push(a.streetAddress.trim());
  }
  const unit = [a.buildingName, a.unitFloorRoom].filter((x) => x?.trim()).join(" ");
  if (unit.trim()) lines.push(unit.trim());
  if (a.landmark?.trim()) lines.push(`Landmark: ${a.landmark.trim()}`);
  return lines.join("\n");
}

export type CheckoutDeliveryPayload = {
  user_address_id: string;
  recipient_name: string | null;
  phone: string | null;
  app_region_id: string | null;
  app_city_id: string | null;
  summary_line: string;
  address_detail: string;
};

export function toCheckoutDeliveryPayload(a: UserAddressDTO): CheckoutDeliveryPayload {
  return {
    user_address_id: a.id,
    recipient_name: a.recipientName,
    phone: a.phoneNumber,
    app_region_id: a.appRegionId,
    app_city_id: a.appCityId,
    summary_line: buildTradePublicLine(a),
    address_detail: buildDeliveryDetailLines(a),
  };
}
