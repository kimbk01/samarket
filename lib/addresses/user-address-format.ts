import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getLocationLabelIfValid } from "@/lib/products/form-options";

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

/** 목록·헤더 한 줄 — 잘못된 ID·문자열 "null" 은 제외하고 fullAddress 로 폴백 */
export function buildTradePublicLine(a: UserAddressDTO): string {
  const nn = a.neighborhoodName?.trim();
  if (nn && !isDisplayNullish(nn)) return nn;
  if (a.appRegionId && a.appCityId && !isDisplayNullish(a.appRegionId) && !isDisplayNullish(a.appCityId)) {
    const valid = getLocationLabelIfValid(a.appRegionId, a.appCityId);
    if (valid) return valid;
  }
  const parts = [a.barangay, a.cityMunicipality, a.province].filter(
    (x) => x?.trim() && !isDisplayNullish(x),
  );
  const joined = parts.join(", ").trim();
  if (joined) return joined;
  const fa = a.fullAddress?.trim();
  if (fa && !isDisplayNullish(fa)) return fa;
  const street = [a.streetAddress, a.unitFloorRoom].filter((x) => x?.trim() && !isDisplayNullish(x)).join(" ");
  if (street.trim()) return street.trim();
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
