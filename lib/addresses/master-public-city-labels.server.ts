/**
 * 여러 회원의 공개 지역(시/군) 라벨 — 대표 주소(`is_default_master`) 기준 · 주소 SSOT.
 * `profiles.region_name` 같은 예전 프로필 값은 읽지 않는다(2026-11-09 A7).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { withDerivedAddressLocation } from "@/lib/addresses/address-location-ssot.server";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";

const MASTER_LOCATION_SEL =
  "id,user_id,label_type,nickname,province,city_municipality,barangay,district,street_address,building_name,landmark,full_address,formatted_address,road_address,neighborhood_name,app_region_id,app_city_id,canonical_lgu_id,is_default_master,is_active";

export async function loadMasterPublicCityLabelsByUserIds(
  sb: SupabaseClient<any>,
  userIds: Iterable<string>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set([...userIds].map((x) => String(x ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const { data, error } = await sb
    .from("user_addresses")
    .select(MASTER_LOCATION_SEL)
    .in("user_id", ids)
    .eq("is_active", true)
    .eq("is_default_master", true);
  if (error || !Array.isArray(data)) return out;
  for (const row of data as Record<string, unknown>[]) {
    const uid = String(row.user_id ?? "").trim();
    if (!uid) continue;
    const dto = withDerivedAddressLocation(rowToUserAddressDTO(row));
    out.set(uid, formatPublicAddress(dto)?.trim() || null);
  }
  return out;
}
