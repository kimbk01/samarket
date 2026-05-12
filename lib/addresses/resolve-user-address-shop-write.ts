import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import { encodeShopAddressNickname } from "@/lib/addresses/shop-address-nickname";

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

/**
 * 소유 매장 좌표·주소 스냅샷. 본인 매장이 아니면 null.
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
  const { data, error } = await sb
    .from("stores")
    .select(
      "id,owner_user_id,lat,lng,place_id,formatted_address,detail_address,address_line1,address_line2,region,city,district,store_name,slug",
    )
    .eq("id", sid)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as StoreRow;
  if (String(row.owner_user_id ?? "").trim() !== userId.trim()) return null;

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
    buildingName: str(row.store_name),
    streetAddress: line1,
    province: str(row.region),
    cityMunicipality: str(row.city) || str(row.district),
  };
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
  const snap = await loadOwnedStoreSnapshotForAddress(sb, userId, sid);
  if (!snap) {
    throw new Error("본인 소유의 매장을 찾을 수 없어요.");
  }
  const placeId = snap.placeId?.trim() ?? "";
  if (!placeId) {
    throw new Error(
      "매장에 Google place 가 없어 이 주소로 저장할 수 없습니다. 매장 기본 정보에서 지도 주소를 먼저 등록해 주세요.",
    );
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
    buildingName: snap.buildingName ?? p.buildingName ?? null,
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
