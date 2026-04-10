import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getLocationLabel, getLocationLabelIfValid } from "@/lib/products/form-options";

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
  if (rid && cid) {
    const valid = getLocationLabelIfValid(rid, cid);
    if (valid) return valid;
    const loose = getLocationLabel(rid, cid).trim();
    if (loose) return loose;
  }
  const parts = [a.barangay, a.cityMunicipality, a.province].filter((x) => x?.trim());
  const line = parts.join(", ").trim();
  return line || null;
}

export function buildTradePublicLine(a: UserAddressDTO): string {
  if (a.neighborhoodName?.trim()) return a.neighborhoodName.trim();
  if (a.appRegionId && a.appCityId) return getLocationLabel(a.appRegionId, a.appCityId);
  const parts = [a.barangay, a.cityMunicipality, a.province].filter((x) => x?.trim());
  return parts.join(", ") || (a.fullAddress?.trim() ?? "");
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
