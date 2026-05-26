import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatAddressBookCardPresentation,
  type AddressBookCardPresentation,
} from "@/lib/addresses/address-book-card-presentation";
import { pickMasterUserAddressRow } from "@/lib/addresses/pick-master-user-address-row";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

const ADDRESS_SELECT =
  "id,user_id,label_type,linked_store_id,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,place_id,formatted_address,road_address,detail_address,delivery_note,full_address,neighborhood_name,app_region_id,app_city_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,last_used_at,created_at,updated_at";

/** 신청·어드민 — 계정별 대표 주소록 한 건 (단일 배치 쿼리) */
export async function loadOwnerMasterAddressBookMap(
  sb: SupabaseClient,
  ownerUserIds: string[]
): Promise<Map<string, AddressBookCardPresentation>> {
  const out = new Map<string, AddressBookCardPresentation>();
  const ids = [...new Set(ownerUserIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  const { data: rows, error } = await sb
    .from("user_addresses")
    .select(ADDRESS_SELECT)
    .in("user_id", ids)
    .eq("is_active", true);

  if (error) {
    console.error("[loadOwnerMasterAddressBookMap] user_addresses", error.message);
    return out;
  }
  if (!Array.isArray(rows)) return out;

  const grouped = new Map<string, UserAddressDTO[]>();
  for (const row of rows) {
    const dto = rowToUserAddressDTO(row as Record<string, unknown>);
    if (!dto.userId) continue;
    const arr = grouped.get(dto.userId);
    if (arr) arr.push(dto);
    else grouped.set(dto.userId, [dto]);
  }

  for (const [uid, arr] of grouped.entries()) {
    const master = pickMasterUserAddressRow(arr);
    const book = formatAddressBookCardPresentation(master);
    if (book) out.set(uid, book);
  }
  return out;
}
