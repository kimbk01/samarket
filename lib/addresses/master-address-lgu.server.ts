import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { deriveAddressLocation } from "@/lib/addresses/address-location-ssot.server";

/**
 * 대표 주소(MEMBER MASTER)의 시/군 LGU — **읽기 전용**.
 *
 * 저장된 `canonical_lgu_id` 가 있으면 그 값, 없으면 주소 위치 단일 정의(`deriveAddressLocation`)로 계산한다.
 * 조회 화면들이 「비어 있는 칸만 이 결과로 채워 내려준다」(address-location-ssot)와 같은 규칙이다.
 * 회원 주소 행은 쓰지 않는다 — 쓰기는 `docs/dibay-address-platform-hard-lock.md` Writers 만.
 *
 * - `no_address`: 활성 대표 주소가 없다
 * - `city_unresolved`: 대표 주소는 있으나 시/군을 하나로 정할 수 없다(주소를 다시 저장해야 함)
 * - `unavailable`: 조회 실패
 */
export type MasterAddressLgu =
  | { status: "ok"; lguId: string; stored: boolean }
  | { status: "no_address" }
  | { status: "city_unresolved" }
  | { status: "unavailable" };

const MASTER_LOCATION_COLS =
  "canonical_lgu_id,country_code,province,city_municipality,barangay,district,street_address,building_name,landmark,full_address,formatted_address,road_address,neighborhood_name,app_region_id,app_city_id";

type MasterLocationRow = {
  canonical_lgu_id: string | null;
  country_code: string | null;
  province: string | null;
  city_municipality: string | null;
  barangay: string | null;
  district: string | null;
  street_address: string | null;
  building_name: string | null;
  landmark: string | null;
  full_address: string | null;
  formatted_address: string | null;
  road_address: string | null;
  neighborhood_name: string | null;
  app_region_id: string | null;
  app_city_id: string | null;
};

/** 대표 주소 한 행 → LGU (DB 없이 — 시험 대상) */
export function masterAddressRowToLgu(row: MasterLocationRow | null | undefined): MasterAddressLgu {
  if (!row) return { status: "no_address" };
  const stored = (row.canonical_lgu_id ?? "").trim();
  if (stored) return { status: "ok", lguId: stored, stored: true };
  const derived = deriveAddressLocation({
    canonicalLguId: null,
    countryCode: row.country_code,
    province: row.province,
    cityMunicipality: row.city_municipality,
    barangay: row.barangay,
    district: row.district,
    streetAddress: row.street_address,
    buildingName: row.building_name,
    landmark: row.landmark,
    fullAddress: row.full_address,
    formattedAddress: row.formatted_address,
    roadAddress: row.road_address,
    neighborhoodName: row.neighborhood_name,
    appRegionId: row.app_region_id,
    appCityId: row.app_city_id,
  }).canonicalLguId;
  const lguId = (derived ?? "").trim();
  return lguId ? { status: "ok", lguId, stored: false } : { status: "city_unresolved" };
}

export async function resolveMasterAddressLgu(sb: SupabaseServer, userId: string): Promise<MasterAddressLgu> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { status: "no_address" };
  const { data, error } = await sb
    .from("user_addresses")
    .select(MASTER_LOCATION_COLS)
    .eq("user_id", uid)
    .eq("is_active", true)
    .eq("is_default_master", true)
    .limit(1);
  if (error) return { status: "unavailable" };
  const row = (Array.isArray(data) ? data[0] : null) as MasterLocationRow | null;
  return masterAddressRowToLgu(row);
}
