import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getLocationLabel } from "@/lib/products/form-options";

export function buildTradePublicLine(a: UserAddressDTO): string {
  if (a.neighborhoodName?.trim()) return a.neighborhoodName.trim();
  if (a.appRegionId && a.appCityId) return getLocationLabel(a.appRegionId, a.appCityId);
  const parts = [a.barangay, a.cityMunicipality, a.province].filter((x) => x?.trim());
  return parts.join(", ") || (a.fullAddress?.trim() ?? "");
}

export function buildDeliveryDetailLines(a: UserAddressDTO): string {
  const lines: string[] = [];
  if (a.streetAddress?.trim()) lines.push(a.streetAddress.trim());
  const unit = [a.buildingName, a.unitFloorRoom].filter((x) => x?.trim()).join(" ");
  if (unit.trim()) lines.push(unit.trim());
  if (a.landmark?.trim()) lines.push(`Landmark: ${a.landmark.trim()}`);
  if (a.postalCode?.trim()) lines.push(`ZIP ${a.postalCode.trim()}`);
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
