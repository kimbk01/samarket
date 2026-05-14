import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { encodeShopAddressNickname } from "@/lib/addresses/shop-address-nickname";
import { refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged } from "@/lib/stores/sync-store-orders-checkout-geo";

type StoreRow = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function addressLineHead(v: string | null): string {
  return v?.split(",")[0]?.trim() || v || "";
}

function hasPayloadStorePlaceSnapshot(p: UserAddressWritePayload): boolean {
  return (
    !!p.placeId?.trim() &&
    typeof p.latitude === "number" &&
    Number.isFinite(p.latitude) &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.longitude) &&
    !!(p.formattedAddress?.trim() || p.fullAddress?.trim())
  );
}

export async function assertNoDuplicateShopLinkedAddress(
  sb: SupabaseClient<any>,
  userId: string,
  storeId: string,
  excludeAddressId?: string
): Promise<void> {
  const { data, error } = await sb
    .from("user_addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("linked_store_id", storeId.trim());
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const rid = String((row as { id?: unknown }).id ?? "");
    if (excludeAddressId && rid === excludeAddressId) continue;
    throw new Error("이미 이 매장으로 등록된 주소가 있어요.");
  }
}

async function loadOwnedApprovedStoreRow(
  sb: SupabaseClient<any>,
  userId: string,
  storeId: string,
): Promise<StoreRow | null> {
  const sid = storeId.trim();
  if (!sid) return null;
  const { data, error } = await sb
    .from("stores")
    .select(
      "id,owner_user_id,approval_status,lat,lng,place_id,formatted_address,detail_address,address_line1,address_line2,region,city,district,store_name,slug",
    )
    .eq("id", sid)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as StoreRow;
  if (String(row.owner_user_id ?? "").trim() !== userId.trim()) return null;
  if (String(row.approval_status ?? "").trim() !== "approved") return null;
  return row;
}

/**
 * 승인된 본인 매장 좌표·주소 스냅샷. 본인 매장이 아니거나 미승인이면 null.
 */
export async function loadOwnedStoreSnapshotForAddress(
  sb: SupabaseClient<any>,
  userId: string,
  storeId: string
): Promise<{
  lat: number;
  lng: number;
  placeId: string | null;
  formattedAddress: string | null;
  roadLine: string;
  fullLine: string;
  buildingName: string | null;
  streetAddress: string | null;
  province: string | null;
  cityMunicipality: string | null;
} | null> {
  const sid = storeId.trim();
  if (!sid) return null;
  const row = await loadOwnedApprovedStoreRow(sb, userId, sid);
  if (!row) return null;

  const lat = num(row.lat);
  const lng = num(row.lng);
  if (lat == null || lng == null) return null;

  const line1 = str(row.address_line1);
  const line2 = str(row.address_line2);
  const city = str(row.city);
  const region = str(row.region);
  const formatted = str(row.formatted_address);
  const composed =
    formatted ||
    [line1, line2, city, region].filter(Boolean).join(", ").trim() ||
    line1 ||
    "";
  const roadLine =
    formatted?.split(",")[0]?.trim() ||
    line1 ||
    composed.split(",")[0]?.trim() ||
    composed;

  return {
    lat,
    lng,
    placeId: str(row.place_id),
    formattedAddress: formatted,
    roadLine: roadLine || composed,
    fullLine: composed,
    /** `stores.store_name` 은 프로필명이지 구글 POI 건물명이 아님 — user_addresses.building_name 과 혼동 금지 */
    buildingName: null,
    streetAddress: line1,
    province: str(row.region),
    cityMunicipality: str(row.city) || str(row.district),
  };
}

async function syncApprovedStoreAddressFromAddressPayload(
  sb: SupabaseClient<any>,
  storeRow: StoreRow,
  p: UserAddressWritePayload,
): Promise<void> {
  const sid = String(storeRow.id ?? "").trim();
  if (!sid || !hasPayloadStorePlaceSnapshot(p)) return;

  const formatted = (p.formattedAddress ?? p.fullAddress ?? "").trim();
  const road = (p.roadAddress ?? p.streetAddress ?? addressLineHead(formatted)).trim();
  const detail = (p.detailAddress ?? p.unitFloorRoom ?? "").trim();
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  const patch = {
    place_id: p.placeId!.trim(),
    formatted_address: formatted,
    detail_address: detail || null,
    lat,
    lng,
    district: road || null,
    address_line1: road || null,
    address_line2: detail || null,
    region: p.province?.trim() || str(storeRow.region),
    city: p.cityMunicipality?.trim() || str(storeRow.city),
  };

  const latChanged = num(storeRow.lat) !== lat;
  const lngChanged = num(storeRow.lng) !== lng;
  const { error } = await sb.from("stores").update(patch).eq("id", sid);
  if (error) throw new Error(error.message);
  if (latChanged || lngChanged) {
    await refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(sb, sid);
  }
}

/** 매장 행이면 DB에 넣을 좌표·place·닉네임을 매장 스냅샷으로 정규화한다. */
export async function resolveUserAddressWritePayloadForShop(
  sb: SupabaseClient<any>,
  userId: string,
  p: UserAddressWritePayload,
  excludeAddressId?: string
): Promise<UserAddressWritePayload> {
  if (p.labelType !== "shop") {
    return { ...p, linkedStoreId: null };
  }
  const sid = (p.linkedStoreId ?? "").trim();
  if (!sid) {
    throw new Error("매장을 선택해 주세요.");
  }
  await assertNoDuplicateShopLinkedAddress(sb, userId, sid, excludeAddressId);
  const storeRow = await loadOwnedApprovedStoreRow(sb, userId, sid);
  if (!storeRow) {
    throw new Error("승인된 매장 오너만 Store Address를 등록할 수 있습니다.");
  }

  if (hasPayloadStorePlaceSnapshot(p)) {
    await syncApprovedStoreAddressFromAddressPayload(sb, storeRow, p);
  }

  const snap = await loadOwnedStoreSnapshotForAddress(sb, userId, sid);
  if (!snap) {
    throw new Error("검색 결과에서 매장 주소를 선택해 주세요.");
  }
  const placeId = snap.placeId?.trim() ?? "";
  if (!placeId) {
    throw new Error("검색 결과에서 매장 주소를 선택해 주세요.");
  }

  if (hasPayloadStorePlaceSnapshot(p)) {
    const userFormatted = (p.formattedAddress ?? p.fullAddress ?? "").trim();
    const userRoad = (p.roadAddress ?? p.streetAddress ?? addressLineHead(userFormatted)).trim();
    const snapFormatted = (snap.formattedAddress ?? snap.fullLine).trim();
    const formatted = userFormatted || snapFormatted;
    const road = userRoad || snap.roadLine || formatted;
    return {
      ...p,
      labelType: "shop",
      linkedStoreId: sid,
      nickname: encodeShopAddressNickname(sid),
      latitude: snap.lat,
      longitude: snap.lng,
      placeId,
      formattedAddress: formatted,
      roadAddress: road,
      fullAddress: formatted || snap.fullLine,
      streetAddress: (p.streetAddress?.trim() || road || snap.streetAddress || "").trim() || null,
      /** 구글 장소의 건물·POI 이름 — `stores.store_name`(프로필)과 별개 */
      buildingName: p.buildingName?.trim() || null,
      province: p.province?.trim() || snap.province,
      cityMunicipality: p.cityMunicipality?.trim() || snap.cityMunicipality,
    };
  }

  const formatted = (snap.formattedAddress ?? snap.fullLine).trim();
  const road = (snap.roadLine || formatted).trim();

  return {
    ...p,
    labelType: "shop",
    linkedStoreId: sid,
    nickname: encodeShopAddressNickname(sid),
    latitude: snap.lat,
    longitude: snap.lng,
    placeId,
    formattedAddress: formatted,
    roadAddress: road || formatted,
    fullAddress: formatted || snap.fullLine,
    streetAddress: snap.streetAddress ?? road.slice(0, 400),
    buildingName: p.buildingName?.trim() || null,
    province: snap.province ?? p.province ?? null,
    cityMunicipality: snap.cityMunicipality ?? p.cityMunicipality ?? null,
  };
}

/** PATCH 시 매장 스냅샷을 다시 덮어쓸지 — 배달 메모만 고칠 때는 false */
export function shouldApplyShopSnapshotToUpdatePatch(
  p: Partial<import("@/lib/addresses/user-address-types").UserAddressWritePayload>,
  dto: import("@/lib/addresses/user-address-types").UserAddressDTO
): boolean {
  if (p.labelType === "shop" || p.linkedStoreId !== undefined) return true;
  if (dto.labelType !== "shop") return false;
  return (
    p.placeId !== undefined ||
    p.latitude !== undefined ||
    p.longitude !== undefined ||
    p.formattedAddress !== undefined
  );
}

export function shopResolvedToAddressPatch(
  r: UserAddressWritePayload
): Partial<import("@/lib/addresses/user-address-types").UserAddressWritePayload> {
  return {
    labelType: "shop",
    linkedStoreId: r.linkedStoreId,
    nickname: r.nickname,
    latitude: r.latitude,
    longitude: r.longitude,
    placeId: r.placeId,
    formattedAddress: r.formattedAddress,
    roadAddress: r.roadAddress,
    fullAddress: r.fullAddress,
    streetAddress: r.streetAddress,
    buildingName: r.buildingName,
    province: r.province,
    cityMunicipality: r.cityMunicipality,
  };
}
