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
