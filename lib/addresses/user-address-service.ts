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
import {
  normalizeAddressClientRequestId,
  USER_ADDRESS_CLIENT_REQUEST_UNIQUE_INDEX,
} from "@/lib/addresses/address-client-request-id";
import { resolveCanonicalLguIdForAddressWrite } from "@/lib/delivery/service-area/resolve-member-canonical-lgu";

const SEL =
  "id,user_id,label_type,linked_store_id,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,place_id,formatted_address,road_address,detail_address,delivery_note,full_address,neighborhood_name,app_region_id,app_city_id,canonical_lgu_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,last_used_at,created_at,updated_at";

/**
 * MASTER LGU SSOT — when a row becomes (or remains) active routing master,
 * persist canonical_lgu_id if structured city/province resolve uniquely.
 * Never invent LGU; never clear an existing id on failed resolve.
 */
async function touchPersistCanonicalLguIfResolvable(
  sb: SupabaseClient<any>,
  userId: string,
  addressId: string
): Promise<void> {
  const id = String(addressId ?? "").trim();
  if (!id) return;
  const { data, error } = await sb
    .from("user_addresses")
    .select("id,canonical_lgu_id,city_municipality,province")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return;
  const row = data as Record<string, unknown>;
  if (String(row.canonical_lgu_id ?? "").trim()) return;
  const resolved = resolveCanonicalLguIdForAddressWrite({
    cityMunicipality: row.city_municipality as string | null,
    province: row.province as string | null,
  });
  if (!resolved) return;
  const { error: upErr } = await sb
    .from("user_addresses")
    .update({ canonical_lgu_id: resolved })
    .eq("id", id)
    .eq("user_id", userId);
  if (upErr) {
    console.error("[touchPersistCanonicalLguIfResolvable]", upErr.message);
  }
}

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

/** Partial unique index — one active address per (user, linked store). Not a default-flag conflict. */
const LINKED_STORE_UNIQUE_INDEX = "user_addresses_user_active_linked_store_unique";

function throwUserAddressWriteError(
  error: { message?: string; code?: string; details?: string | null } | null,
  fallback: string,
): never {
  const msg = String(error?.message ?? fallback);
  if (`${msg} ${String(error?.details ?? "")}`.includes(LINKED_STORE_UNIQUE_INDEX)) {
    throw new Error("shop_address_duplicate");
  }
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
  await setUserAddressMasterAtomic(sb, userId, pick.id);
  await touchPersistCanonicalLguIfResolvable(sb, userId, pick.id);
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
    activeCount: list.length,
  };
}

export { pickAddressRowForDeliveryRouting } from "@/lib/addresses/pick-address-row-for-delivery-routing";

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

/**
 * 대표 주소 지정 — 기존 대표 해제 + 대상 지정을 DB 한 트랜잭션으로 (`user_address_set_master`, service_role 전용).
 * 해제·지정을 별도 문장으로 실행하면 실패·동시 요청 시 활성 대표 0건이 생긴다 (ADDR-DATA-004).
 */
async function setUserAddressMasterAtomic(
  sb: SupabaseClient<any>,
  userId: string,
  addressId: string,
): Promise<void> {
  const { data, error } = await sb.rpc("user_address_set_master", {
    p_user_id: userId,
    p_address_id: addressId,
  });
  if (error) throwUserAddressWriteError(error, "address_set_master_failed");
  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.ok !== true) {
    throw new Error(result?.error === "address_not_found" ? "address_not_found" : "address_set_master_failed");
  }
}

async function applyDefaultFlagsOnCreate(
  sb: SupabaseClient<any>,
  userId: string,
  addressId: string,
  p: UserAddressWritePayload
): Promise<void> {
  if (p.isDefaultMaster) {
    await setUserAddressMasterAtomic(sb, userId, addressId);
    await touchPersistCanonicalLguIfResolvable(sb, userId, addressId);
  }
}

async function userHasActiveMasterForWrite(
  sb: SupabaseClient<any>,
  userId: string,
  fallback: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("user_addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("is_default_master", true)
    .limit(1);
  if (error) throwUserAddressWriteError(error, fallback);
  return Boolean(data && data.length > 0);
}

/**
 * 활성 대표(`is_default_master`)가 없으면 방금 만든 주소를 대표로 지정한다.
 * (개수==1 판정은 동시 첫 생성 2건에서 대표가 0건이 되는 경합이 있어 "대표 없음" 기준으로 판정)
 * 매장 연결 행이 대표가 된 경우 일반 주소 우선 규칙은 이후 `repairStoreLinkedMasterAfterWrite` 가 맞춘다.
 */
async function ensureSomeoneDefaultIfFirst(
  sb: SupabaseClient<any>,
  userId: string,
  addressId: string,
  p: UserAddressWritePayload
): Promise<void> {
  if (p.isDefaultMaster) return;
  if (await userHasActiveMasterForWrite(sb, userId, "address_create_failed")) return;
  await setUserAddressMasterAtomic(sb, userId, addressId);
  await touchPersistCanonicalLguIfResolvable(sb, userId, addressId);
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
  if (next.master) {
    await setUserAddressMasterAtomic(sb, userId, id);
    await touchPersistCanonicalLguIfResolvable(sb, userId, id);
  }
  await repairStoreLinkedMasterAfterWrite(sb, userId);
  const { data: again, error: eAgain } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (eAgain || !again) throwUserAddressWriteError(eAgain, "address_set_master_failed");
  return rowToUserAddressDTO(again as Record<string, unknown>);
}

export type { CheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
export { buildTradePublicLine, buildDeliveryDetailLines, toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";

/** 같은 client_request_id 로 이미 만든 주소 — 재시도·연타 시 새 행 대신 반환 (ADDR-DATA-003) */
async function findUserAddressByClientRequestId(
  sb: SupabaseClient<any>,
  userId: string,
  clientRequestId: string,
): Promise<UserAddressDTO | null> {
  const { data, error } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("user_id", userId)
    .eq("client_request_id", clientRequestId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throwUserAddressWriteError(error, "address_create_failed");
  return data ? rowToUserAddressDTO(data as Record<string, unknown>) : null;
}

export async function createUserAddress(
  sb: SupabaseClient<any>,
  userId: string,
  p: UserAddressWritePayload,
  opts?: { clientRequestId?: string | null },
): Promise<UserAddressDTO> {
  if (!p.useForLife && !p.useForTrade && !p.useForDelivery) {
    throw new Error("use_case_required");
  }
  const clientRequestId = normalizeAddressClientRequestId(opts?.clientRequestId);
  if (clientRequestId) {
    const replay = await findUserAddressByClientRequestId(sb, userId, clientRequestId);
    if (replay) {
      // 앞선 요청이 INSERT 후 대표 지정 단계에서 실패했을 수 있다 — 이번 입력·대표 지정을 끝까지 반영
      await updateUserAddress(sb, userId, replay.id, p);
      await ensureSomeoneDefaultIfFirst(sb, userId, replay.id, p);
      const { data: done } = await sb.from("user_addresses").select(SEL).eq("id", replay.id).single();
      return done ? rowToUserAddressDTO(done as Record<string, unknown>) : replay;
    }
  }
  const resolved = await resolveUserAddressWritePayloadForShop(sb, userId, p);
  const invalid = validatePlacesAddressPayload(resolved);
  if (invalid) {
    throw new Error(invalid);
  }
  const displayNick = await assertAddressNicknameUnique(sb, userId, resolved.nickname ?? "");
  const pWithNick: UserAddressWritePayload = { ...resolved, nickname: displayNick };
  const row = payloadToInsertRow(userId, userAddressInsertPayloadWithoutDefaultFlags(pWithNick));
  row.canonical_lgu_id = resolveCanonicalLguIdForAddressWrite({
    cityMunicipality: pWithNick.cityMunicipality,
    province: pWithNick.province,
  });
  if (clientRequestId) row.client_request_id = clientRequestId;
  const { data, error } = await sb.from("user_addresses").insert(row).select(SEL).single();
  if (error) {
    const raced =
      clientRequestId &&
      `${String(error.message ?? "")} ${String((error as { details?: string | null }).details ?? "")}`.includes(
        USER_ADDRESS_CLIENT_REQUEST_UNIQUE_INDEX,
      )
        ? await findUserAddressByClientRequestId(sb, userId, clientRequestId)
        : null;
    if (raced) return raced;
    throwUserAddressWriteError(error, "address_create_failed");
  }
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
  const { data: ex, error: e0 } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();
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

  const touchesCityIdentity =
    "city_municipality" in patch ||
    "province" in patch ||
    "place_id" in patch ||
    "latitude" in patch ||
    "longitude" in patch;
  if (touchesCityIdentity) {
    const nextLgu = resolveCanonicalLguIdForAddressWrite({
      cityMunicipality: resolved.cityMunicipality,
      province: resolved.province,
    });
    const norm = (v: string | null | undefined) => String(v ?? "").trim();
    const cityOrProvinceChanged =
      norm(resolved.cityMunicipality) !== norm(dto.cityMunicipality) ||
      norm(resolved.province) !== norm(dto.province);
    // MASTER LGU SSOT: never clear an existing id on failed resolve (pin-only / same city edits).
    if (nextLgu || cityOrProvinceChanged) {
      patch.canonical_lgu_id = nextLgu;
    }
  }

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
    await setUserAddressMasterAtomic(sb, userId, id);
    await touchPersistCanonicalLguIfResolvable(sb, userId, id);
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

  // 비활성 행에 기본 플래그를 남기지 않는다 (ADDR-DATA-011 재발 방지)
  const { error } = await sb
    .from("user_addresses")
    .update({
      is_active: false,
      is_default_master: false,
      is_default_life: false,
      is_default_trade: false,
      is_default_delivery: false,
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throwUserAddressWriteError(error, "address_delete_failed");

  const { data: rest, error: eRest } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (eRest) throwUserAddressWriteError(eRest, "address_delete_failed");
  const next = rest?.[0] as Record<string, unknown> | undefined;
  if (!next) {
    await repairStoreLinkedMasterAfterWrite(sb, userId);
    return;
  }

  const wasMaster = !!(cur as Record<string, unknown>).is_default_master;
  const nid = String(next.id);

  if (wasMaster) {
    await setUserAddressMasterAtomic(sb, userId, nid);
    await touchPersistCanonicalLguIfResolvable(sb, userId, nid);
  }
  await repairStoreLinkedMasterAfterWrite(sb, userId);
}
