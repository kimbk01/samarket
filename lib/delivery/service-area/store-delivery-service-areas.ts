/**
 * Persist / load Owner-Admin shared delivery service areas (normalized SSOT).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
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
  /**
   * LOC-006 optimistic concurrency - the areas version the editor loaded
   * (`loadStoreDeliveryServiceAreasVersion`; null = no saved rows). `undefined` = no check.
   */
  expectedVersion?: string | null;
};

/** LOC-006 - editor saved against a stale selection (another save happened first). */
export class StoreDeliveryServiceAreasVersionConflictError extends Error {
  readonly code = "service_areas_version_conflict" as const;
  readonly currentVersion: string | null;
  constructor(currentVersion: string | null) {
    super("service_areas_version_conflict");
    this.name = "StoreDeliveryServiceAreasVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

/** LOC-006 - ids not in the platform PH LGU catalog (would never match a member LGU). */
export function findUnknownDeliveryServiceAreaLguIds(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    if (!getPlatformPhLguDisplayNameById(id)) out.push(id);
  }
  return out;
}

/** LOC-006 - areas version = max(updated_at) of the store's rows (null = none). Exact DB string. */
export async function loadStoreDeliveryServiceAreasVersion(
  sb: SupabaseClient,
  storeId: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("store_delivery_service_areas")
    .select("updated_at")
    .eq("store_id", storeId.trim())
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const v = (data?.[0] as { updated_at?: unknown } | undefined)?.updated_at;
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Replace selected areas in ONE DB transaction (`replace_store_delivery_service_areas`):
 * store row lock -> version check -> delete + insert + authority. Same RPC for Owner and Admin.
 * Does not silently rewrite selections on R/address change - caller passes explicit set.
 */
export async function replaceStoreDeliveryServiceAreas(
  sb: SupabaseClient,
  input: ReplaceStoreDeliveryServiceAreasInput
): Promise<{ authority: DeliveryServiceAreaAuthority; geoIdentities: string[]; version: string | null }> {
  const storeId = input.storeId.trim();
  if (!storeId) throw new Error("missing_store_id");

  const homeId = (input.storeHomeLguId ?? "").trim() || null;
  const seen = new Set<string>();
  const ids: string[] = [];
  const names: string[] = [];
  let explicitHome: string | null = null;
  for (const a of input.areas) {
    const id = String(a.geoIdentity ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    names.push((a.displayName ?? "").trim() || getPlatformPhLguDisplayNameById(id) || id);
    if (homeId == null && a.isStoreHome === true && explicitHome == null) explicitHome = id;
  }

  const checkVersion = input.expectedVersion !== undefined;
  const { data, error } = await sb.rpc("replace_store_delivery_service_areas", {
    p_store_id: storeId,
    p_ids: ids,
    p_display_names: names,
    p_home_id: homeId ?? explicitHome,
    p_activate: input.activateV2 === true,
    p_source: input.source,
    p_expected_version: checkVersion ? input.expectedVersion : null,
    p_check_version: checkVersion,
  });
  if (error) throw new Error(error.message);
  const res = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    authority?: unknown;
    version?: unknown;
    current_version?: unknown;
  };
  if (res.ok !== true) {
    if (res.error === "service_areas_version_conflict") {
      throw new StoreDeliveryServiceAreasVersionConflictError(
        typeof res.current_version === "string" ? res.current_version : null
      );
    }
    throw new Error(res.error || "replace_failed");
  }
  return {
    authority: parseDeliveryServiceAreaAuthority(res.authority),
    geoIdentities: ids,
    version: typeof res.version === "string" ? res.version : null,
  };
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
