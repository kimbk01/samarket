import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s.length) return null;
  const lower = s.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "nan") return null;
  return s;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown, d: boolean): boolean {
  if (typeof v === "boolean") return v;
  return d;
}

const LABELS: UserAddressLabelType[] = ["home", "office", "shop", "other"];

function parseLabel(v: unknown): UserAddressLabelType {
  const s = String(v ?? "other").toLowerCase();
  return LABELS.includes(s as UserAddressLabelType) ? (s as UserAddressLabelType) : "other";
}

export function rowToUserAddressDTO(row: Row): UserAddressDTO {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    labelType: parseLabel(row.label_type),
    linkedStoreId: str(row.linked_store_id),
    nickname: str(row.nickname),
    recipientName: str(row.recipient_name),
    phoneNumber: str(row.phone_number),
    countryCode: str(row.country_code) ?? "PH",
    countryName: str(row.country_name) ?? "Philippines",
    province: str(row.province),
    cityMunicipality: str(row.city_municipality),
    barangay: str(row.barangay),
    district: str(row.district),
    streetAddress: str(row.street_address),
    buildingName: str(row.building_name),
    unitFloorRoom: str(row.unit_floor_room),
    landmark: str(row.landmark),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    placeId: str(row.place_id),
    formattedAddress: str(row.formatted_address),
    roadAddress: str(row.road_address),
    detailAddress: str(row.detail_address),
    deliveryNote: str(row.delivery_note),
    fullAddress: str(row.full_address),
    neighborhoodName: str(row.neighborhood_name),
    appRegionId: str(row.app_region_id),
    appCityId: str(row.app_city_id),
    useForLife: bool(row.use_for_life, true),
    useForTrade: bool(row.use_for_trade, true),
    useForDelivery: bool(row.use_for_delivery, true),
    isDefaultMaster: bool(row.is_default_master, false),
    isDefaultLife: bool(row.is_default_life, false),
    isDefaultTrade: bool(row.is_default_trade, false),
    isDefaultDelivery: bool(row.is_default_delivery, false),
    isActive: bool(row.is_active, true),
    sortOrder: Math.floor(Number(row.sort_order) || 0),
    lastUsedAt: str(row.last_used_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function payloadToInsertRow(
  userId: string,
  p: import("@/lib/addresses/user-address-types").UserAddressWritePayload
): Record<string, unknown> {
  return {
    user_id: userId,
    label_type: p.labelType,
    linked_store_id: p.labelType === "shop" ? (p.linkedStoreId?.trim() || null) : null,
    nickname: p.nickname ?? null,
    recipient_name: p.recipientName ?? null,
    phone_number: p.phoneNumber ?? null,
    country_code: p.countryCode ?? "PH",
    country_name: p.countryName ?? "Philippines",
    province: p.province ?? null,
    city_municipality: p.cityMunicipality ?? null,
    barangay: p.barangay ?? null,
    district: p.district ?? null,
    street_address: p.streetAddress ?? null,
    building_name: p.buildingName ?? null,
    unit_floor_room: p.unitFloorRoom ?? null,
    landmark: p.landmark ?? null,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    place_id: p.placeId ?? null,
    formatted_address: p.formattedAddress ?? p.fullAddress ?? null,
    road_address: p.roadAddress ?? p.streetAddress ?? null,
    detail_address: p.detailAddress ?? p.unitFloorRoom ?? null,
    delivery_note: p.deliveryNote ?? null,
    full_address: p.fullAddress ?? null,
    neighborhood_name: p.neighborhoodName ?? null,
    app_region_id: p.appRegionId ?? null,
    app_city_id: p.appCityId ?? null,
    use_for_life: p.useForLife ?? true,
    use_for_trade: p.useForTrade ?? true,
    use_for_delivery: p.useForDelivery ?? true,
    is_default_master: p.isDefaultMaster ?? false,
    is_default_life: p.isDefaultLife ?? false,
    is_default_trade: p.isDefaultTrade ?? false,
    is_default_delivery: p.isDefaultDelivery ?? false,
    sort_order: p.sortOrder ?? 0,
    last_used_at: p.lastUsedAt ?? null,
    is_active: true,
  };
}

export function userAddressDtoToWritePayload(d: import("@/lib/addresses/user-address-types").UserAddressDTO): import("@/lib/addresses/user-address-types").UserAddressWritePayload {
  return {
    labelType: d.labelType,
    linkedStoreId: d.linkedStoreId,
    nickname: d.nickname,
    recipientName: d.recipientName,
    phoneNumber: d.phoneNumber,
    countryCode: d.countryCode,
    countryName: d.countryName,
    province: d.province,
    cityMunicipality: d.cityMunicipality,
    barangay: d.barangay,
    district: d.district,
    streetAddress: d.streetAddress,
    buildingName: d.buildingName,
    unitFloorRoom: d.unitFloorRoom,
    landmark: d.landmark,
    latitude: d.latitude,
    longitude: d.longitude,
    placeId: d.placeId,
    formattedAddress: d.formattedAddress,
    roadAddress: d.roadAddress,
    detailAddress: d.detailAddress,
    deliveryNote: d.deliveryNote,
    fullAddress: d.fullAddress,
    neighborhoodName: d.neighborhoodName,
    appRegionId: d.appRegionId,
    appCityId: d.appCityId,
    useForLife: d.useForLife,
    useForTrade: d.useForTrade,
    useForDelivery: d.useForDelivery,
    isDefaultMaster: d.isDefaultMaster,
    isDefaultLife: d.isDefaultLife,
    isDefaultTrade: d.isDefaultTrade,
    isDefaultDelivery: d.isDefaultDelivery,
    sortOrder: d.sortOrder,
    lastUsedAt: d.lastUsedAt,
  };
}

export function payloadToUpdatePatch(
  p: Partial<import("@/lib/addresses/user-address-types").UserAddressWritePayload>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.labelType !== undefined) out.label_type = p.labelType;
  if (p.labelType !== undefined && p.labelType !== "shop") {
    out.linked_store_id = null;
  }
  if (p.linkedStoreId !== undefined) out.linked_store_id = p.linkedStoreId?.trim() || null;
  if (p.nickname !== undefined) out.nickname = p.nickname;
  if (p.recipientName !== undefined) out.recipient_name = p.recipientName;
  if (p.phoneNumber !== undefined) out.phone_number = p.phoneNumber;
  if (p.countryCode !== undefined) out.country_code = p.countryCode;
  if (p.countryName !== undefined) out.country_name = p.countryName;
  if (p.province !== undefined) out.province = p.province;
  if (p.cityMunicipality !== undefined) out.city_municipality = p.cityMunicipality;
  if (p.barangay !== undefined) out.barangay = p.barangay;
  if (p.district !== undefined) out.district = p.district;
  if (p.streetAddress !== undefined) out.street_address = p.streetAddress;
  if (p.buildingName !== undefined) out.building_name = p.buildingName;
  if (p.unitFloorRoom !== undefined) out.unit_floor_room = p.unitFloorRoom;
  if (p.landmark !== undefined) out.landmark = p.landmark;
  if (p.latitude !== undefined) out.latitude = p.latitude;
  if (p.longitude !== undefined) out.longitude = p.longitude;
  if (p.placeId !== undefined) out.place_id = p.placeId;
  if (p.formattedAddress !== undefined) out.formatted_address = p.formattedAddress;
  if (p.roadAddress !== undefined) out.road_address = p.roadAddress;
  if (p.detailAddress !== undefined) out.detail_address = p.detailAddress;
  if (p.deliveryNote !== undefined) out.delivery_note = p.deliveryNote;
  if (p.fullAddress !== undefined) out.full_address = p.fullAddress;
  if (p.neighborhoodName !== undefined) out.neighborhood_name = p.neighborhoodName;
  if (p.appRegionId !== undefined) out.app_region_id = p.appRegionId;
  if (p.appCityId !== undefined) out.app_city_id = p.appCityId;
  if (p.useForLife !== undefined) out.use_for_life = p.useForLife;
  if (p.useForTrade !== undefined) out.use_for_trade = p.useForTrade;
  if (p.useForDelivery !== undefined) out.use_for_delivery = p.useForDelivery;
  if (p.isDefaultMaster !== undefined) out.is_default_master = p.isDefaultMaster;
  if (p.isDefaultLife !== undefined) out.is_default_life = p.isDefaultLife;
  if (p.isDefaultTrade !== undefined) out.is_default_trade = p.isDefaultTrade;
  if (p.isDefaultDelivery !== undefined) out.is_default_delivery = p.isDefaultDelivery;
  if (p.sortOrder !== undefined) out.sort_order = p.sortOrder;
  if (p.lastUsedAt !== undefined) out.last_used_at = p.lastUsedAt;
  return out;
}
