import type { UserAddressLabelType, UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

/**
 * `POST/PATCH /api/me/addresses` — `validatePlacesAddressPayload` 반환 코드(본문 `error` 문자열).
 * 필리핀형 Places 저장: `place_id` + 좌표 + `formatted_address`(또는 full) + 상세(`detail_address`/`unit_floor_room`) 필수.
 * 사용자 문구는 `addresses-ui` · `translateUserAddressApiError` 에서 i18n.
 */
export const USER_ADDRESS_PLACES_VALIDATION_CODES = {
  place_id_required: "place_id_required",
  formatted_address_required: "formatted_address_required",
  coordinates_required: "coordinates_required",
  coordinates_invalid: "coordinates_invalid",
  detail_address_required: "detail_address_required",
} as const;

export type UserAddressPlacesValidationCode = keyof typeof USER_ADDRESS_PLACES_VALIDATION_CODES;

const LABELS: UserAddressLabelType[] = ["home", "office", "shop", "other"];

function optionalText(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function first(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
  }
  return undefined;
}

export function parseUserAddressWritePayload(body: unknown, opts?: { partial?: boolean }): UserAddressWritePayload | Partial<UserAddressWritePayload> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const out: Partial<UserAddressWritePayload> = {};

  const labelRaw = first(o, "labelType", "label_type", "label");
  if (labelRaw !== undefined || !opts?.partial) {
    const label = String(labelRaw ?? "other").toLowerCase();
    if (!LABELS.includes(label as UserAddressLabelType)) return null;
    out.labelType = label as UserAddressLabelType;
  }

  const linkedRaw = first(o, "linkedStoreId", "linked_store_id");
  if (linkedRaw !== undefined) {
    const s = String(linkedRaw ?? "").trim();
    out.linkedStoreId = s.length > 0 ? s : null;
  }

  const copy = (field: keyof UserAddressWritePayload, ...keys: string[]) => {
    const v = optionalText(first(o, ...keys));
    if (v !== undefined) (out as Record<string, unknown>)[field] = v;
  };

  copy("nickname", "nickname");
  copy("recipientName", "recipientName", "recipient_name");
  copy("phoneNumber", "phoneNumber", "phone_number");
  copy("countryCode", "countryCode", "country_code");
  copy("countryName", "countryName", "country_name");
  copy("province", "province");
  copy("cityMunicipality", "cityMunicipality", "city_municipality");
  copy("barangay", "barangay");
  copy("district", "district");
  copy("streetAddress", "streetAddress", "street_address");
  copy("buildingName", "buildingName", "building_name");
  copy("unitFloorRoom", "unitFloorRoom", "unit_floor_room");
  copy("landmark", "landmark");
  copy("placeId", "placeId", "place_id");
  copy("formattedAddress", "formattedAddress", "formatted_address");
  copy("roadAddress", "roadAddress", "road_address");
  copy("detailAddress", "detailAddress", "detail_address");
  copy("deliveryNote", "deliveryNote", "delivery_note");
  copy("fullAddress", "fullAddress", "full_address");
  copy("neighborhoodName", "neighborhoodName", "neighborhood_name");
  copy("appRegionId", "appRegionId", "app_region_id");
  copy("appCityId", "appCityId", "app_city_id");

  const latRaw = first(o, "latitude", "lat");
  if (latRaw !== undefined) out.latitude = parseFiniteLatitude(latRaw);
  const lngRaw = first(o, "longitude", "lng");
  if (lngRaw !== undefined) out.longitude = parseFiniteLongitude(lngRaw);

  const bool = (field: keyof UserAddressWritePayload, ...keys: string[]) => {
    const v = first(o, ...keys);
    if (v !== undefined) (out as Record<string, unknown>)[field] = Boolean(v);
  };
  bool("useForLife", "useForLife", "use_for_life");
  bool("useForTrade", "useForTrade", "use_for_trade");
  bool("useForDelivery", "useForDelivery", "use_for_delivery");
  bool("isDefaultMaster", "isDefaultMaster", "is_default_master", "isDefault");
  bool("isDefaultLife", "isDefaultLife", "is_default_life");
  bool("isDefaultTrade", "isDefaultTrade", "is_default_trade");
  bool("isDefaultDelivery", "isDefaultDelivery", "is_default_delivery");

  if (typeof o.sortOrder === "number") out.sortOrder = o.sortOrder;
  if (!opts?.partial) {
    out.useForLife = out.useForLife !== false;
    out.useForTrade = out.useForTrade !== false;
    out.useForDelivery = out.useForDelivery !== false;
    out.isDefaultMaster = out.isDefaultMaster === true;
    out.isDefaultLife = out.isDefaultLife === true;
    out.isDefaultTrade = out.isDefaultTrade === true;
    out.isDefaultDelivery = out.isDefaultDelivery === true;
  }
  return opts?.partial ? out : out as UserAddressWritePayload;
}

/**
 * CURRENT PIN SSOT:
 * - place_id optional when no current-pin POI/building identity (road/barangay fallback).
 * - If buildingName is set as current-pin POI/building identity, place_id must also be set.
 * - Pass `requirePlace: true` only when a caller still needs a hard Places identity.
 */
export function validatePlacesAddressPayload(p: Partial<UserAddressWritePayload>, opts?: { requirePlace?: boolean }): string | null {
  const placeId = p.placeId?.trim() ?? "";
  const buildingName = (p.buildingName ?? "").trim();
  const formatted = (p.formattedAddress ?? p.fullAddress ?? "").trim();
  const detail = (p.detailAddress ?? p.unitFloorRoom ?? "").trim();
  const lat = p.latitude;
  const lng = p.longitude;
  if (opts?.requirePlace === true && !placeId) return "place_id_required";
  // Current-pin POI/building name without place_id is an inconsistent identity unit.
  if (buildingName && !placeId) return "place_id_required";
  if (!formatted) return "formatted_address_required";
  if (lat == null || lng == null) return "coordinates_required";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "coordinates_required";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "coordinates_invalid";
  if (!detail) return "detail_address_required";
  return null;
}
