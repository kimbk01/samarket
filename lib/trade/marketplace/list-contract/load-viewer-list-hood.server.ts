/**
 * 거래 목록 계약 §2 (D) — 로그인 회원의 대표 주소 동네(앱 지역 동네 id).
 * 주소 지정 회원의 첫 구간 「내 동네」에 쓴다. 주소가 없거나 앱 지역으로 못 바꾸면 null(= 내 시부터).
 * 같은 회원의 반복 요청은 짧게 메모리 캐시(목록 첫 페이지·다음 페이지가 같은 값을 쓰도록).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import type { ListHoodAnchor } from "@/lib/trade/marketplace/list-contract/list-location-blocks";

const TTL_MS = 60_000;
const cache = new Map<string, { hood: ListHoodAnchor | null; expiresAt: number }>();

type MasterRow = {
  app_region_id?: string | null;
  app_city_id?: string | null;
  neighborhood_name?: string | null;
  full_address?: string | null;
  formatted_address?: string | null;
  road_address?: string | null;
  building_name?: string | null;
  landmark?: string | null;
  barangay?: string | null;
  district?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  street_address?: string | null;
};

export async function loadViewerListHood(
  sb: SupabaseClient<any>,
  viewerUserId: string | null | undefined
): Promise<ListHoodAnchor | null> {
  const uid = (viewerUserId ?? "").trim();
  if (!uid) return null;
  const hit = cache.get(uid);
  if (hit && hit.expiresAt > Date.now()) return hit.hood;

  let hood: ListHoodAnchor | null = null;
  try {
    const { data, error } = await sb
      .from("user_addresses")
      .select(
        "app_region_id,app_city_id,neighborhood_name,full_address,formatted_address,road_address,building_name,landmark,barangay,district,city_municipality,province,street_address"
      )
      .eq("user_id", uid)
      .eq("is_active", true)
      .eq("is_default_master", true)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      const row = data as MasterRow;
      const loc = mapUserAddressToAppLocation({
        appRegionId: row.app_region_id ?? null,
        appCityId: row.app_city_id ?? null,
        neighborhoodName: row.neighborhood_name ?? null,
        fullAddress: row.full_address ?? null,
        formattedAddress: row.formatted_address ?? null,
        roadAddress: row.road_address ?? null,
        buildingName: row.building_name ?? null,
        landmark: row.landmark ?? null,
        barangay: row.barangay ?? null,
        district: row.district ?? null,
        cityMunicipality: row.city_municipality ?? null,
        province: row.province ?? null,
        streetAddress: row.street_address ?? null,
      } as Parameters<typeof mapUserAddressToAppLocation>[0]);
      if (loc?.regionId && loc.cityId) hood = { regionId: loc.regionId, cityId: loc.cityId };
    }
  } catch {
    hood = null;
  }
  cache.set(uid, { hood, expiresAt: Date.now() + TTL_MS });
  return hood;
}
