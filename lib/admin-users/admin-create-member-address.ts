import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import type { UserAddressDTO, UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { formatPhDeliveryStreetSummary } from "@/lib/addresses/ph-address-display";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";

/** 관리자 수동 회원 — Google 주소록과 동일 필드 집합 */
export type AdminCreateMemberAddressInput = {
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string;
  roadAddress: string;
  fullAddress: string;
  streetAddress: string;
  unitFloorRoom: string;
  buildingName: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  neighborhoodName: string;
  deliveryNote: string;
};

export function emptyAdminCreateMemberAddress(): AdminCreateMemberAddressInput {
  return {
    placeId: "",
    latitude: null,
    longitude: null,
    formattedAddress: "",
    roadAddress: "",
    fullAddress: "",
    streetAddress: "",
    unitFloorRoom: "",
    buildingName: "",
    barangay: "",
    cityMunicipality: "",
    province: "",
    neighborhoodName: "",
    deliveryNote: "",
  };
}

export function adminCreateMemberAddressHasSelection(a: AdminCreateMemberAddressInput): boolean {
  return Boolean(a.placeId.trim() && a.latitude != null && a.longitude != null);
}

function asInferDto(a: AdminCreateMemberAddressInput): UserAddressDTO {
  return {
    id: "",
    userId: "",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: a.province.trim() || null,
    cityMunicipality: a.cityMunicipality.trim() || null,
    barangay: a.barangay.trim() || null,
    district: null,
    streetAddress: a.streetAddress.trim() || null,
    buildingName: a.buildingName.trim() || null,
    unitFloorRoom: a.unitFloorRoom.trim() || null,
    landmark: null,
    latitude: a.latitude,
    longitude: a.longitude,
    placeId: a.placeId.trim() || null,
    formattedAddress: a.formattedAddress.trim() || null,
    roadAddress: a.roadAddress.trim() || null,
    detailAddress: a.unitFloorRoom.trim() || null,
    deliveryNote: a.deliveryNote.trim() || null,
    fullAddress: a.fullAddress.trim() || a.formattedAddress.trim() || null,
    neighborhoodName: a.neighborhoodName.trim() || null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

export function inferTradeLocationFromAdminAddress(
  a: AdminCreateMemberAddressInput
): { regionId: string; cityId: string } | null {
  return inferAppLocationIdsFromUserAddress(asInferDto(a));
}

export function buildAdminCreateMemberContactAddressLine(
  a: AdminCreateMemberAddressInput,
  regionId: string,
  cityId: string
): string {
  const streetPreview = formatPhDeliveryStreetSummary(asInferDto(a));
  const lines: string[] = [];
  if (streetPreview.trim()) lines.push(streetPreview.trim());
  const detail = a.unitFloorRoom.trim();
  if (detail) lines.push(detail);
  const loc = buildProfileRegionNameForStorage(regionId, cityId);
  if (loc) lines.push(loc);
  return lines.join("\n");
}

export function buildUserAddressSeedPayload(
  a: AdminCreateMemberAddressInput,
  opts: { recipientName: string; phoneNumber: string | null; regionId: string; cityId: string }
): UserAddressWritePayload {
  const dto = asInferDto(a);
  const full =
    a.fullAddress.trim() ||
    a.formattedAddress.trim() ||
    formatPhDeliveryStreetSummary(dto) ||
    "Philippines";

  return {
    labelType: "home",
    nickname: null,
    recipientName: opts.recipientName,
    phoneNumber: opts.phoneNumber,
    countryCode: "PH",
    countryName: "Philippines",
    province: dto.province,
    cityMunicipality: dto.cityMunicipality,
    barangay: dto.barangay,
    streetAddress: dto.streetAddress,
    buildingName: dto.buildingName,
    unitFloorRoom: dto.unitFloorRoom,
    landmark: null,
    latitude: a.latitude,
    longitude: a.longitude,
    placeId: a.placeId.trim(),
    formattedAddress: dto.formattedAddress,
    roadAddress: dto.roadAddress || dto.formattedAddress,
    detailAddress: dto.unitFloorRoom,
    deliveryNote: dto.deliveryNote,
    fullAddress: full,
    neighborhoodName: dto.neighborhoodName,
    appRegionId: opts.regionId || null,
    appCityId: opts.cityId || null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
  };
}

export function profileGeoFromAdminAddress(a: AdminCreateMemberAddressInput): {
  region_code: string | null;
  region_name: string | null;
  address_street_line: string | null;
  address_detail: string | null;
  latitude: number | null;
  longitude: number | null;
  full_address: string | null;
} {
  const inferred = inferTradeLocationFromAdminAddress(a);
  const regionId = inferred?.regionId ?? "";
  const cityId = inferred?.cityId ?? "";
  const street =
    a.streetAddress.trim() ||
    formatPhDeliveryStreetSummary(asInferDto(a)) ||
    a.formattedAddress.trim() ||
    null;
  const full =
    [a.formattedAddress.trim(), a.unitFloorRoom.trim(), buildProfileRegionNameForStorage(regionId, cityId)]
      .filter(Boolean)
      .join(" · ")
      .trim() || a.formattedAddress.trim() || null;

  return {
    region_code: encodeProfileAppLocationStorage(regionId, cityId),
    region_name: buildProfileRegionNameForStorage(regionId, cityId),
    address_street_line: street,
    address_detail: a.unitFloorRoom.trim() || null,
    latitude: a.latitude,
    longitude: a.longitude,
    full_address: full,
  };
}
