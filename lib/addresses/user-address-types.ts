/**
 * user_addresses — API·UI 공통 타입 (DB snake_case 는 매퍼에서 변환)
 */

export type UserAddressLabelType = "home" | "office" | "shop" | "other";

export type UserAddressDTO = {
  id: string;
  userId: string;
  labelType: UserAddressLabelType;
  /** `labelType === "shop"` 일 때 연결된 `stores.id` */
  linkedStoreId: string | null;
  nickname: string | null;
  recipientName: string | null;
  phoneNumber: string | null;
  countryCode: string;
  countryName: string;
  province: string | null;
  cityMunicipality: string | null;
  barangay: string | null;
  district: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  unitFloorRoom: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  formattedAddress: string | null;
  roadAddress: string | null;
  detailAddress: string | null;
  deliveryNote: string | null;
  fullAddress: string | null;
  neighborhoodName: string | null;
  appRegionId: string | null;
  appCityId: string | null;
  useForLife: boolean;
  useForTrade: boolean;
  useForDelivery: boolean;
  isDefaultMaster: boolean;
  isDefaultLife: boolean;
  isDefaultTrade: boolean;
  isDefaultDelivery: boolean;
  isActive: boolean;
  sortOrder: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserAddressDefaultsDTO = {
  master: UserAddressDTO | null;
  life: UserAddressDTO | null;
  trade: UserAddressDTO | null;
  delivery: UserAddressDTO | null;
};

export type UserAddressWritePayload = {
  labelType: UserAddressLabelType;
  linkedStoreId?: string | null;
  nickname?: string | null;
  recipientName?: string | null;
  phoneNumber?: string | null;
  countryCode?: string;
  countryName?: string;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
  district?: string | null;
  streetAddress?: string | null;
  buildingName?: string | null;
  unitFloorRoom?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  formattedAddress?: string | null;
  roadAddress?: string | null;
  detailAddress?: string | null;
  deliveryNote?: string | null;
  fullAddress?: string | null;
  neighborhoodName?: string | null;
  appRegionId?: string | null;
  appCityId?: string | null;
  useForLife?: boolean;
  useForTrade?: boolean;
  useForDelivery?: boolean;
  isDefaultMaster?: boolean;
  isDefaultLife?: boolean;
  isDefaultTrade?: boolean;
  isDefaultDelivery?: boolean;
  sortOrder?: number;
  lastUsedAt?: string | null;
  /** API 전용 — DB 미저장. true 이면 저장 직후 이 주소를 대표·용도 기본으로 승격 */
  promoteAsLastSavedPrimary?: boolean;
};
