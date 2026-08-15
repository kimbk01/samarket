import type { SupabaseClient } from "@supabase/supabase-js";
import { REGIONS } from "@/lib/products/form-options";
import {
  payloadToInsertRow,
  payloadToUpdatePatch,
  rowToUserAddressDTO,
  userAddressDtoToWritePayload,
} from "@/lib/addresses/user-address-mapper";
import type {
  UserAddressDTO,
  UserAddressDefaultsDTO,
  UserAddressWritePayload,
} from "@/lib/addresses/user-address-types";
import { normalizeAddressNicknameKey } from "@/lib/addresses/address-nickname-key";
import { decodeLocationOnlyAddressNicknameId } from "@/lib/addresses/location-only-address-nickname";
import { validatePlacesAddressPayload } from "@/lib/addresses/address-api-validation";
import {
  resolveUserAddressWritePayloadForShop,
  shouldApplyShopSnapshotToUpdatePatch,
  shopResolvedToAddressPatch,
} from "@/lib/addresses/resolve-user-address-shop-write";
import { isPostgresUniqueViolation } from "@/lib/postgres/unique-violation";

const SEL =
  "id,user_id,label_type,linked_store_id,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,place_id,formatted_address,road_address,detail_address,delivery_note,full_address,neighborhood_name,app_region_id,app_city_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,last_used_at,created_at,updated_at";

function sortAddressList(rows: UserAddressDTO[]): UserAddressDTO[] {
  return [...rows].sort((a, b) => {
    const score = (x: UserAddressDTO) => (x.isDefaultMaster ? 0 : 4);
    const d = score(a) - score(b);
    if (d !== 0) return d;
    const au = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bu = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (bu !== au) return bu - au;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/** `labelType === shop` 이고 매장에 연결된 행 — 대표(마스터) 자동 지정 후보에서 제외한다. */
function isLinkedSamarketStoreAddressRow(dto: {
  labelType: UserAddressDTO["labelType"];
  linkedStoreId?: string | null;
}): boolean {
  return dto.labelType === "shop" && Boolean(String(dto.linkedStoreId ?? "").trim());
}

/** 일반(비매장연결) 주소가 하나라도 있으면 true — 매장만으로는 대표를 빼앗지 않도록 판별 */
async function userHasNonStoreLinkedAddress(sb: SupabaseClient<any>, userId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("user_addresses")
    .select("label_type,linked_store_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throwUserAddressWriteError(error, "address_update_failed");
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>;
    const lt = String(row.label_type ?? "");
    const lid = String(row.linked_store_id ?? "").trim();
    const isStore = lt === "shop" && Boolean(lid);
    if (!isStore) return true;
  }
  return false;
}

const ERR_STORE_CANNOT_BE_MASTER = "store_cannot_be_master";

async function assertStoreAddressNotForcedAsMasterWhenGeneralExists(
  sb: SupabaseClient<any>,
  userId: string,
  dto: { labelType: UserAddressDTO["labelType"]; linkedStoreId?: string | null },
): Promise<void> {
  if (!isLinkedSamarketStoreAddressRow(dto)) return;
  if (await userHasNonStoreLinkedAddress(sb, userId)) {
    throw new Error(ERR_STORE_CANNOT_BE_MASTER);
  }
}

function throwUserAddressWriteError(error: { message?: string; code?: string } | null, fallback: string): never {
  const msg = String(error?.message ?? fallback);
  if (isPostgresUniqueViolation(error) || /user_addresses_one_(master|life|trade|delivery)/i.test(msg)) {
    throw new Error("address_default_conflict");
  }
  console.error("[user-address-write]", fallback, msg);
  throw new Error(fallback);
}

/** INSERT must not carry default flags — unique indexes `user_addresses_one_*` fire on insert. */
export function userAddressInsertPayloadWithoutDefaultFlags(
  p: UserAddressWritePayload,
): UserAddressWritePayload {
  return {
    ...p,
    isDefaultMaster: false,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
  };
}

/** 매장 연결 행이 대표인데 일반 주소가 있으면 대표 플래그만 일반 주소 한 건으로 옮긴다. */
async function repairStoreLinkedMasterWhenGeneralAddressExists(
  sb: SupabaseClient<any>,
  userId: string,
  list: UserAddressDTO[],
): Promise<boolean> {
  const master = list.find((x) => x.isDefaultMaster);
  if (!master) return false;
  if (!isLinkedSamarketStoreAddressRow(master)) return false;
  if (!(await userHasNonStoreLinkedAddress(sb, userId))) return false;
  const nonStore = list.filter((a) => !isLinkedSamarketStoreAddressRow(a));
  if (nonStore.length === 0) return false;
  const ordered = [...nonStore].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const pick = ordered[0];
  await clearDefaultColumn(sb, userId, "is_default_master");
  const { error } = await sb
    .from("user_addresses")
    .update({
      is_default_master: true,
    })
    .eq("id", pick.id)
    .eq("user_id", userId);
  if (error) throwUserAddressWriteError(error, "address_set_master_failed");
  return true;
}

/**
 * READ ONLY. GET must not invent a master or rewrite flags.
 * Default repair belongs on create / update / delete / set-default writers.
 */
export async function listUserAddresses(
  sb: SupabaseClient<any>,
  userId: string
): Promise<UserAddressDTO[]> {
  const { data, error } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[listUserAddresses]", error.message);
    throw new Error("load_failed");
  }
  return sortAddressList((data ?? []).map((r) => rowToUserAddressDTO(r as Record<string, unknown>)));
}

/** POST-WRITE invariant: store-linked row must not remain master when a general address exists. Not GET repair. */
async function repairStoreLinkedMasterAfterWrite(
  sb: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  const list = await listUserAddresses(sb, userId);
  await repairStoreLinkedMasterWhenGeneralAddressExists(sb, userId, list);
}

/**
 * 제품 기본주소 완료 — 활성 `is_default_master` 행만.
 * region_name / 프로필 geo / “아무 주소나 있음” 은 완료가 아니다.
 */
export async function hasCanonicalDefaultMasterAddress(
  sb: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("user_addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("is_default_master", true)
    .limit(1);
  if (error) {
    console.error("[hasCanonicalDefaultMasterAddress]", error.message);
    throw new Error("load_failed");
  }
  return Boolean(data && data.length > 0);
}

/** Alias of `hasCanonicalDefaultMasterAddress`. Geo fallback / list-side write 금지. */
export async function isMandatoryAddressGateSatisfied(
  sb: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  return hasCanonicalDefaultMasterAddress(sb, userId);
}

export async function getUserAddressDefaults(
  sb: SupabaseClient<any>,
  userId: string
): Promise<UserAddressDefaultsDTO> {
  const list = await listUserAddresses(sb, userId);
  return {
    master: list.find((x) => x.isDefaultMaster) ?? null,
    life: list.find((x) => x.isDefaultLife) ?? null,
    trade: list.find((x) => x.isDefaultTrade) ?? null,
    delivery: list.find((x) => x.isDefaultDelivery) ?? null,
  };
}

/**
 * 배달 ETA·checkout 자동 채움에 쓸 주소 한 건.
 * Current USER delivery address authority is the master row.
 */
export function pickAddressRowForDeliveryRouting(defs: UserAddressDefaultsDTO): UserAddressDTO | null {
  return defs.master?.id ? defs.master : null;
}

/** 거래 글 `region`/`city` 일괄 수정 등 — `TradeDefaultLocationBlock` 과 동일 우선순위 */
export type BulkRegionPatchResolvedLocation = {
  regionId: string;
  cityId: string;
  regionLabel: string;
  cityLabel: string;
  barangayLabel: string | null;
  source: "master_address";
};

function resolveLocationFromUserAddressDto(
  row: UserAddressDTO | null | undefined,
  source: BulkRegionPatchResolvedLocation["source"],
): BulkRegionPatchResolvedLocation | null {
  if (!row?.id) return null;
  const regionId = row.appRegionId?.trim() ?? "";
  const cityId = row.appCityId?.trim() ?? "";
  if (!regionId || !cityId) return null;
  const regionLabel = REGIONS.find((r) => r.id === regionId)?.name ?? regionId;
  const cityLabel =
    REGIONS.find((r) => r.id === regionId)?.cities.find((c) => c.id === cityId)?.name ?? cityId;
  const barangayLabel = row.neighborhoodName?.trim() || null;
  return { regionId, cityId, regionLabel, cityLabel, barangayLabel, source };
}

/**
 * 내 거래 글 일괄 지역 패치·유사 배치용 좌표 한 벌.
 * Current USER address authority인 대표(master)에서만 derive한다.
 */
export async function resolveBulkRegionPatchLocationForUser(
  sb: SupabaseClient<any>,
  userId: string,
): Promise<BulkRegionPatchResolvedLocation | null> {
  const defs = await getUserAddressDefaults(sb, userId);
  return resolveLocationFromUserAddressDto(defs.master, "master_address");
}

/**
 * 같은 사용자 내 주소 표시 이름 중복 방지. 반환값은 DB에 넣을 trim 된 표시 문자열.
 */
async function assertAddressNicknameUnique(
  sb: SupabaseClient<any>,
  userId: string,
  rawNickname: string,
  excludeAddressId?: string
): Promise<string> {
  const display = rawNickname.trim();
  const key = normalizeAddressNicknameKey(display);
  if (!key) {
    throw new Error("nickname_required");
  }
  const locOnlyForRow = decodeLocationOnlyAddressNicknameId(display);
  if (locOnlyForRow != null) {
    const selfId = excludeAddressId?.trim() ?? "";
    if (!selfId || locOnlyForRow !== selfId) {
      throw new Error("nickname_reserved_format");
    }
  }
  const { data, error } = await sb
    .from("user_addresses")
    .select("id,nickname")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throwUserAddressWriteError(error, "address_update_failed");
  for (const row of data ?? []) {
    const rid = String((row as { id: unknown }).id ?? "");
    if (excludeAddressId && rid === excludeAddressId) continue;
    const nk = normalizeAddressNicknameKey(String((row as { nickname?: unknown }).nickname ?? ""));
    if (nk === key) {
      throw new Error("nickname_duplicate");
    }
  }
  return display;
}

async function clearDefaultColumn(
  sb: SupabaseClient<any>,
  userId: string,
  col: "is_default_master" | "is_default_life" | "is_default_trade" | "is_default_delivery"
): Promise<void> {
  const { error } = await sb
    .from("user_addresses")
    .update({ [col]: false })
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq(col, true);
  if (error) throwUserAddressWriteError(error, "address_default_conflict");
}

async function applyDefaultFlagsOnCreate(
  sb: SupabaseClient<any>,
  userId: string,
  addressId: string,
  p: UserAddressWritePayload
): Promise<void> {
  if (p.isDefaultMaster) {
    await clearDefaultColumn(sb, userId, "is_default_master");
    const { error } = await sb
      .from("user_addresses")
      .update({ is_default_master: true })
      .eq("id", addressId)
      .eq("user_id", userId);
    if (error) throwUserAddressWriteError(error, "address_set_master_failed");
  }
}

/** 신규 주소에 기본 플래그가 하나도 없으면 첫 주소를 대표(`is_default_master`)만 지정 */
async function ensureSomeoneDefaultIfFirst(
  sb: SupabaseClient<any>,
  userId: string,
  addressId: string,
  p: UserAddressWritePayload
): Promise<void> {
  const { count, error: cErr } = await sb
    .from("user_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (cErr) throwUserAddressWriteError(cErr, "address_create_failed");
  const n = count ?? 0;
  if (n !== 1) return;
  if (p.isDefaultMaster) return;
  await sb
    .from("user_addresses")
    .update({
      is_default_master: true,
    })
    .eq("id", addressId)
    .eq("user_id", userId);
}

export async function markUserAddressUsed(
  sb: SupabaseClient<any>,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await sb
    .from("user_addresses")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throwUserAddressWriteError(error, "address_update_failed");
}

export async function setUserAddressAsDefault(
  sb: SupabaseClient<any>,
  userId: string,
  id: string,
  opts?: { master?: boolean; life?: boolean; trade?: boolean; delivery?: boolean },
): Promise<UserAddressDTO> {
  const { data: exists, error: e0 } = await sb
    .from("user_addresses")
    .select("id,label_type,linked_store_id")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (e0) throwUserAddressWriteError(e0, "address_set_master_failed");
  if (!exists) throw new Error("address_not_found");
  const targetPick = rowToUserAddressDTO(exists as Record<string, unknown>);

  const next = {
    master: opts?.master === true,
    life: opts?.life === true,
    trade: opts?.trade === true,
    delivery: opts?.delivery === true,
  };
  if (!next.master && !next.life && !next.trade && !next.delivery) {
    next.master = true;
  }
  if (next.life || next.trade || next.delivery) {
    next.master = true;
  }
  if (next.master) {
    await assertStoreAddressNotForcedAsMasterWhenGeneralExists(sb, userId, targetPick);
  }
  const patch: Record<string, boolean> = {};
  if (next.master) {
    await clearDefaultColumn(sb, userId, "is_default_master");
    patch.is_default_master = true;
  }
  const { data, error } = await sb
    .from("user_addresses")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select(SEL)
    .single();
  if (error || !data) throwUserAddressWriteError(error, "address_set_master_failed");
  await repairStoreLinkedMasterAfterWrite(sb, userId);
  const { data: again } = await sb.from("user_addresses").select(SEL).eq("id", id).eq("user_id", userId).maybeSingle();
  return rowToUserAddressDTO((again ?? data) as Record<string, unknown>);
}

export type { CheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
export { buildTradePublicLine, buildDeliveryDetailLines, toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";

export async function createUserAddress(
  sb: SupabaseClient<any>,
  userId: string,
  p: UserAddressWritePayload
): Promise<UserAddressDTO> {
  if (!p.useForLife && !p.useForTrade && !p.useForDelivery) {
    throw new Error("use_case_required");
  }
  const resolved = await resolveUserAddressWritePayloadForShop(sb, userId, p);
  const invalid = validatePlacesAddressPayload(resolved);
  if (invalid) {
    throw new Error(invalid);
  }
  const displayNick = await assertAddressNicknameUnique(sb, userId, resolved.nickname ?? "");
  const pWithNick: UserAddressWritePayload = { ...resolved, nickname: displayNick };
  const row = payloadToInsertRow(userId, userAddressInsertPayloadWithoutDefaultFlags(pWithNick));
  const { data, error } = await sb.from("user_addresses").insert(row).select(SEL).single();
  if (error) throwUserAddressWriteError(error, "address_create_failed");
  const dto = rowToUserAddressDTO(data as Record<string, unknown>);
  await applyDefaultFlagsOnCreate(sb, userId, dto.id, pWithNick);
  await ensureSomeoneDefaultIfFirst(sb, userId, dto.id, pWithNick);
  await repairStoreLinkedMasterAfterWrite(sb, userId);
  const { data: again } = await sb.from("user_addresses").select(SEL).eq("id", dto.id).single();
  return rowToUserAddressDTO((again ?? data) as Record<string, unknown>);
}

export async function updateUserAddress(
  sb: SupabaseClient<any>,
  userId: string,
  id: string,
  p: Partial<UserAddressWritePayload>
): Promise<UserAddressDTO> {
  const { data: ex, error: e0 } = await sb.from("user_addresses").select(SEL).eq("id", id).eq("user_id", userId).single();
  if (e0 || !ex) throw new Error("address_not_found");
  const dto = rowToUserAddressDTO(ex as Record<string, unknown>);
  const base = userAddressDtoToWritePayload(dto);
  const mergedFull: UserAddressWritePayload = { ...base, ...p };
  const resolved = await resolveUserAddressWritePayloadForShop(sb, userId, mergedFull, id);

  if (p.isDefaultMaster === true) {
    await assertStoreAddressNotForcedAsMasterWhenGeneralExists(sb, userId, resolved);
  }

  let merged: Partial<UserAddressWritePayload> = { ...p };
  if (resolved.labelType === "shop" && shouldApplyShopSnapshotToUpdatePatch(p, dto)) {
    merged = { ...p, ...shopResolvedToAddressPatch(resolved) };
  }
  if (p.labelType !== undefined && p.labelType !== "shop") {
    merged = { ...merged, linkedStoreId: null };
  }

  if (merged.nickname !== undefined) {
    const displayNick = await assertAddressNicknameUnique(sb, userId, String(merged.nickname), id);
    merged = { ...merged, nickname: displayNick };
  } else if (resolved.labelType === "shop" && shouldApplyShopSnapshotToUpdatePatch(p, dto) && resolved.nickname) {
    const displayNick = await assertAddressNicknameUnique(sb, userId, String(resolved.nickname), id);
    merged = { ...merged, nickname: displayNick };
  }

  const patch = payloadToUpdatePatch(merged);
  delete patch.is_default_master;
  delete patch.is_default_life;
  delete patch.is_default_trade;
  delete patch.is_default_delivery;

  const touchesGeo =
    "place_id" in patch ||
    "latitude" in patch ||
    "longitude" in patch ||
    "formatted_address" in patch ||
    "road_address" in patch ||
    "full_address" in patch ||
    "detail_address" in patch ||
    "unit_floor_room" in patch;
  if (touchesGeo) {
    const candidate = { ...base, ...merged } as UserAddressWritePayload;
    const inv = validatePlacesAddressPayload(candidate);
    if (inv) throw new Error(inv);
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("user_addresses").update(patch).eq("id", id).eq("user_id", userId);
    if (error) throwUserAddressWriteError(error, "address_update_failed");
  }
  if (p.isDefaultMaster === true) {
    await clearDefaultColumn(sb, userId, "is_default_master");
    const { error: eM } = await sb
      .from("user_addresses")
      .update({ is_default_master: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (eM) throwUserAddressWriteError(eM, "address_set_master_failed");
  }
  await repairStoreLinkedMasterAfterWrite(sb, userId);
  const { data, error: e2 } = await sb.from("user_addresses").select(SEL).eq("id", id).single();
  if (e2 || !data) throw new Error("address_not_found");
  return rowToUserAddressDTO(data as Record<string, unknown>);
}

export async function deleteUserAddress(
  sb: SupabaseClient<any>,
  userId: string,
  id: string
): Promise<void> {
  const { data: cur, error: e0 } = await sb
    .from("user_addresses")
    .select("id,is_default_master,is_default_life,is_default_trade,is_default_delivery")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (e0) throwUserAddressWriteError(e0, "address_delete_failed");
  if (!cur) throw new Error("address_not_found");

  const { error } = await sb.from("user_addresses").update({ is_active: false }).eq("id", id).eq("user_id", userId);
  if (error) throwUserAddressWriteError(error, "address_delete_failed");

  const { data: rest } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  const next = rest?.[0] as Record<string, unknown> | undefined;
  if (!next) {
    await repairStoreLinkedMasterAfterWrite(sb, userId);
    return;
  }

  const wasMaster = !!(cur as Record<string, unknown>).is_default_master;
  const nid = String(next.id);

  if (wasMaster) {
    await clearDefaultColumn(sb, userId, "is_default_master");
    await sb.from("user_addresses").update({ is_default_master: true }).eq("id", nid).eq("user_id", userId);
  }
  await repairStoreLinkedMasterAfterWrite(sb, userId);
}
