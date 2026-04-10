import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocationLabel, getLocationLabelIfValid, REGIONS } from "@/lib/products/form-options";
import {
  payloadToInsertRow,
  payloadToUpdatePatch,
  rowToUserAddressDTO,
} from "@/lib/addresses/user-address-mapper";
import type {
  UserAddressDTO,
  UserAddressDefaultsDTO,
  UserAddressWritePayload,
} from "@/lib/addresses/user-address-types";

const SEL =
  "id,user_id,label_type,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,full_address,neighborhood_name,app_region_id,app_city_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,created_at,updated_at";

function sortAddressList(rows: UserAddressDTO[]): UserAddressDTO[] {
  return [...rows].sort((a, b) => {
    const score = (x: UserAddressDTO) =>
      (x.isDefaultMaster ? 0 : 4) +
      (x.isDefaultLife ? 0 : 1) +
      (x.isDefaultTrade ? 0 : 0.5) +
      (x.isDefaultDelivery ? 0 : 0.25);
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/** 대표가 하나도 없으면 목록의 첫 번째(등록 순) 주소를 대표·생활·거래·배달 기본으로 통일 */
async function assignFirstRowAsFullDefaultIfNoMaster(
  sb: SupabaseClient<any>,
  userId: string,
  list: UserAddressDTO[],
): Promise<void> {
  if (list.length === 0 || list.some((x) => x.isDefaultMaster)) return;
  const ordered = [...list].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const pick = ordered[0];
  await clearDefaultColumn(sb, userId, "is_default_master");
  await clearDefaultColumn(sb, userId, "is_default_life");
  await clearDefaultColumn(sb, userId, "is_default_trade");
  await clearDefaultColumn(sb, userId, "is_default_delivery");
  const { error } = await sb
    .from("user_addresses")
    .update({
      is_default_master: true,
      is_default_life: true,
      is_default_trade: true,
      is_default_delivery: true,
    })
    .eq("id", pick.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await syncProfileRegionFromLifeDefault(sb, userId);
}

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
  if (error) throw new Error(error.message);
  let list = sortAddressList((data ?? []).map((r) => rowToUserAddressDTO(r as Record<string, unknown>)));
  if (list.length > 0 && !list.some((x) => x.isDefaultMaster)) {
    await assignFirstRowAsFullDefaultIfNoMaster(sb, userId, list);
    const { data: data2, error: e2 } = await sb
      .from("user_addresses")
      .select(SEL)
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    if (e2) throw new Error(e2.message);
    list = sortAddressList((data2 ?? []).map((r) => rowToUserAddressDTO(r as Record<string, unknown>)));
  }
  return list;
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
  if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
  }
  if (p.isDefaultLife) {
    await clearDefaultColumn(sb, userId, "is_default_life");
    const { error } = await sb
      .from("user_addresses")
      .update({ is_default_life: true })
      .eq("id", addressId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  if (p.isDefaultTrade) {
    await clearDefaultColumn(sb, userId, "is_default_trade");
    const { error } = await sb
      .from("user_addresses")
      .update({ is_default_trade: true })
      .eq("id", addressId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  if (p.isDefaultDelivery) {
    await clearDefaultColumn(sb, userId, "is_default_delivery");
    const { error } = await sb
      .from("user_addresses")
      .update({ is_default_delivery: true })
      .eq("id", addressId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

/** 신규 주소에 기본 플래그가 하나도 없으면 첫 주소로 대표+전부 기본 처리 */
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
  if (cErr) throw new Error(cErr.message);
  const n = count ?? 0;
  if (n !== 1) return;
  const any =
    p.isDefaultMaster ||
    p.isDefaultLife ||
    p.isDefaultTrade ||
    p.isDefaultDelivery;
  if (any) return;
  await sb
    .from("user_addresses")
    .update({
      is_default_master: true,
      is_default_life: true,
      is_default_trade: true,
      is_default_delivery: true,
    })
    .eq("id", addressId)
    .eq("user_id", userId);
}

export async function syncProfileRegionFromLifeDefault(
  sb: SupabaseClient<any>,
  userId: string
): Promise<void> {
  const { data, error } = await sb
    .from("user_addresses")
    .select("app_region_id,app_city_id,neighborhood_name")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("is_default_life", true)
    .maybeSingle();
  if (error || !data) return;
  const r = data as Record<string, unknown>;
  const rid = typeof r.app_region_id === "string" ? r.app_region_id.trim() : "";
  const cid = typeof r.app_city_id === "string" ? r.app_city_id.trim() : "";
  const nn = typeof r.neighborhood_name === "string" ? r.neighborhood_name.trim() : "";
  if (!rid) return;
  const c = cid.trim();
  const label =
    nn ||
    (c ? getLocationLabelIfValid(rid, c) : null) ||
    (c ? getLocationLabel(rid, c) : REGIONS.find((x) => x.id === rid)?.name) ||
    rid;
  const code = c ? `${rid}|${c}` : rid;
  await sb
    .from("profiles")
    .update({ region_code: code, region_name: label })
    .eq("id", userId);
}

export type { CheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
export { buildTradePublicLine, buildDeliveryDetailLines, toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";

export async function createUserAddress(
  sb: SupabaseClient<any>,
  userId: string,
  p: UserAddressWritePayload
): Promise<UserAddressDTO> {
  if (!p.useForLife && !p.useForTrade && !p.useForDelivery) {
    throw new Error("생활·거래·배달 중 최소 한 가지 용도를 선택해 주세요.");
  }
  const row = payloadToInsertRow(userId, p);
  const { data, error } = await sb.from("user_addresses").insert(row).select(SEL).single();
  if (error) throw new Error(error.message);
  const dto = rowToUserAddressDTO(data as Record<string, unknown>);
  await applyDefaultFlagsOnCreate(sb, userId, dto.id, p);
  await ensureSomeoneDefaultIfFirst(sb, userId, dto.id, p);
  await syncProfileRegionFromLifeDefault(sb, userId);
  const { data: again } = await sb.from("user_addresses").select(SEL).eq("id", dto.id).single();
  return rowToUserAddressDTO((again ?? data) as Record<string, unknown>);
}

export async function updateUserAddress(
  sb: SupabaseClient<any>,
  userId: string,
  id: string,
  p: Partial<UserAddressWritePayload>
): Promise<UserAddressDTO> {
  const patch = payloadToUpdatePatch(p);
  delete patch.is_default_master;
  delete patch.is_default_life;
  delete patch.is_default_trade;
  delete patch.is_default_delivery;
  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("user_addresses").update(patch).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  if (p.isDefaultMaster === true) {
    await clearDefaultColumn(sb, userId, "is_default_master");
    const { error: eM } = await sb
      .from("user_addresses")
      .update({ is_default_master: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (eM) throw new Error(eM.message);
  }
  if (p.isDefaultLife === true) {
    await clearDefaultColumn(sb, userId, "is_default_life");
    const { error: eL } = await sb
      .from("user_addresses")
      .update({ is_default_life: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (eL) throw new Error(eL.message);
  }
  if (p.isDefaultTrade === true) {
    await clearDefaultColumn(sb, userId, "is_default_trade");
    const { error: eT } = await sb
      .from("user_addresses")
      .update({ is_default_trade: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (eT) throw new Error(eT.message);
  }
  if (p.isDefaultDelivery === true) {
    await clearDefaultColumn(sb, userId, "is_default_delivery");
    const { error: eD } = await sb
      .from("user_addresses")
      .update({ is_default_delivery: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (eD) throw new Error(eD.message);
  }
  await syncProfileRegionFromLifeDefault(sb, userId);
  const { data, error: e2 } = await sb.from("user_addresses").select(SEL).eq("id", id).single();
  if (e2 || !data) throw new Error(e2?.message ?? "not found");
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
  if (e0) throw new Error(e0.message);
  if (!cur) throw new Error("주소를 찾을 수 없습니다.");

  const { count, error: cErr } = await sb
    .from("user_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (cErr) throw new Error(cErr.message);
  if ((count ?? 0) <= 1) {
    throw new Error("마지막 주소는 삭제할 수 없습니다. 새 주소를 추가한 뒤 삭제해 주세요.");
  }

  const { error } = await sb.from("user_addresses").update({ is_active: false }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);

  const { data: rest } = await sb
    .from("user_addresses")
    .select(SEL)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  const next = rest?.[0] as Record<string, unknown> | undefined;
  if (!next) return;

  const wasMaster = !!(cur as Record<string, unknown>).is_default_master;
  const wasLife = !!(cur as Record<string, unknown>).is_default_life;
  const wasTrade = !!(cur as Record<string, unknown>).is_default_trade;
  const wasDel = !!(cur as Record<string, unknown>).is_default_delivery;
  const nid = String(next.id);

  if (wasMaster) {
    await clearDefaultColumn(sb, userId, "is_default_master");
    await sb.from("user_addresses").update({ is_default_master: true }).eq("id", nid).eq("user_id", userId);
  }
  if (wasLife) {
    await clearDefaultColumn(sb, userId, "is_default_life");
    await sb.from("user_addresses").update({ is_default_life: true }).eq("id", nid).eq("user_id", userId);
  }
  if (wasTrade) {
    await clearDefaultColumn(sb, userId, "is_default_trade");
    await sb.from("user_addresses").update({ is_default_trade: true }).eq("id", nid).eq("user_id", userId);
  }
  if (wasDel) {
    await clearDefaultColumn(sb, userId, "is_default_delivery");
    await sb.from("user_addresses").update({ is_default_delivery: true }).eq("id", nid).eq("user_id", userId);
  }

  await syncProfileRegionFromLifeDefault(sb, userId);
}
