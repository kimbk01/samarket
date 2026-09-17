/**
 * Persist / load Owner-Admin shared delivery service areas (normalized SSOT).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_SERVICE_AREA_AUTHORITY,
  parseDeliveryServiceAreaAuthority,
  type DeliveryServiceAreaAuthority,
} from "@/lib/delivery/service-area/authority";
import { getPlatformPhLguDisplayNameById } from "@/lib/geo/ph-lgu/platform-ph-lgu";

export type StoreDeliveryServiceAreaRow = {
  geoIdentity: string;
  areaType: "city_municipality";
  displayNameSnapshot: string | null;
  source: "owner" | "admin" | "migration_proposal";
  isStoreHome: boolean;
};

const AREA_SELECT =
  "geo_identity, area_type, display_name_snapshot, source, is_store_home" as const;

export async function loadStoreDeliveryServiceAreaAuthority(
  sb: SupabaseClient,
  storeId: string
): Promise<DeliveryServiceAreaAuthority> {
  const { data, error } = await sb
    .from("stores")
    .select("delivery_service_area_authority")
    .eq("id", storeId.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseDeliveryServiceAreaAuthority(
    (data as { delivery_service_area_authority?: unknown } | null)?.delivery_service_area_authority
  );
}

export async function loadStoreSelectedDeliveryLguIds(
  sb: SupabaseClient,
  storeId: string
): Promise<string[]> {
  const { data, error } = await sb
    .from("store_delivery_service_areas")
    .select("geo_identity")
    .eq("store_id", storeId.trim());
  if (error) throw new Error(error.message);
  const ids: string[] = [];
  for (const row of data ?? []) {
    const id = String((row as { geo_identity?: unknown }).geo_identity ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

export async function loadStoreDeliveryServiceAreas(
  sb: SupabaseClient,
  storeId: string
): Promise<StoreDeliveryServiceAreaRow[]> {
  const { data, error } = await sb
    .from("store_delivery_service_areas")
    .select(AREA_SELECT)
    .eq("store_id", storeId.trim())
    .order("is_store_home", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as {
      geo_identity?: unknown;
      area_type?: unknown;
      display_name_snapshot?: unknown;
      source?: unknown;
      is_store_home?: unknown;
    };
    const geoIdentity = String(r.geo_identity ?? "").trim();
    const sourceRaw = String(r.source ?? "owner");
    const source =
      sourceRaw === "admin" || sourceRaw === "migration_proposal" ? sourceRaw : "owner";
    return {
      geoIdentity,
      areaType: "city_municipality",
      displayNameSnapshot:
        typeof r.display_name_snapshot === "string" ? r.display_name_snapshot : null,
      source,
      isStoreHome: r.is_store_home === true,
    };
  });
}

export type ReplaceStoreDeliveryServiceAreasInput = {
  storeId: string;
  areas: Array<{
    geoIdentity: string;
    isStoreHome?: boolean;
    displayName?: string | null;
  }>;
  source: "owner" | "admin";
  /** When true, also set stores.delivery_service_area_authority = v2_lgu. */
  activateV2?: boolean;
  storeHomeLguId?: string | null;
};

/**
 * Replace selected areas atomically (delete + insert). Same table for Owner and Admin.
 * Does not silently rewrite selections on R/address change — caller passes explicit set.
 */
export async function replaceStoreDeliveryServiceAreas(
  sb: SupabaseClient,
  input: ReplaceStoreDeliveryServiceAreasInput
): Promise<{ authority: DeliveryServiceAreaAuthority; geoIdentities: string[] }> {
  const storeId = input.storeId.trim();
  if (!storeId) throw new Error("missing_store_id");

  const homeId = (input.storeHomeLguId ?? "").trim() || null;
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const a of input.areas) {
    const id = String(a.geoIdentity ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const display =
      (a.displayName ?? "").trim() || getPlatformPhLguDisplayNameById(id) || id;
    rows.push({
      store_id: storeId,
      geo_identity: id,
      area_type: "city_municipality",
      display_name_snapshot: display,
      source: input.source,
      is_store_home: homeId != null ? id === homeId : a.isStoreHome === true,
      updated_at: new Date().toISOString(),
    });
  }

  const { error: delErr } = await sb
    .from("store_delivery_service_areas")
    .delete()
    .eq("store_id", storeId);
  if (delErr) throw new Error(delErr.message);

  if (rows.length > 0) {
    const { error: insErr } = await sb.from("store_delivery_service_areas").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  let authority = await loadStoreDeliveryServiceAreaAuthority(sb, storeId);
  if (input.activateV2 === true) {
    const { error: authErr } = await sb
      .from("stores")
      .update({
        delivery_service_area_authority: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      })
      .eq("id", storeId);
    if (authErr) throw new Error(authErr.message);
    authority = DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU;
  }

  return { authority, geoIdentities: [...seen] };
}

export async function setStoreDeliveryServiceAreaAuthority(
  sb: SupabaseClient,
  storeId: string,
  authority: DeliveryServiceAreaAuthority
): Promise<void> {
  const { error } = await sb
    .from("stores")
    .update({ delivery_service_area_authority: authority })
    .eq("id", storeId.trim());
  if (error) throw new Error(error.message);
}
