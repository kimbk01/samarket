/**
 * Batch-load V2 service-area context for list surfaces (HOME/Browse/Search).
 * Legacy stores need no rows — default authority is legacy_radius.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_SERVICE_AREA_AUTHORITY,
  parseDeliveryServiceAreaAuthority,
  type DeliveryServiceAreaAuthority,
} from "@/lib/delivery/service-area/authority";

export type StoreServiceAreaRuntimeSlice = {
  authorityMode: DeliveryServiceAreaAuthority;
  selectedLguIds: string[];
};

/**
 * Load authority + selected LGU ids for many stores in two queries.
 */
export async function loadStoreServiceAreaRuntimeMap(
  sb: SupabaseClient,
  storeIds: readonly string[]
): Promise<Map<string, StoreServiceAreaRuntimeSlice>> {
  const map = new Map<string, StoreServiceAreaRuntimeSlice>();
  const ids = [...new Set(storeIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  for (const id of ids) {
    map.set(id, {
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: [],
    });
  }
  if (ids.length === 0) return map;

  const { data: stores, error: storeErr } = await sb
    .from("stores")
    .select("id, delivery_service_area_authority")
    .in("id", ids);
  if (storeErr) throw new Error(storeErr.message);

  for (const row of stores ?? []) {
    const id = String((row as { id?: unknown }).id ?? "").trim();
    if (!id) continue;
    const prev = map.get(id) ?? {
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: [],
    };
    map.set(id, {
      ...prev,
      authorityMode: parseDeliveryServiceAreaAuthority(
        (row as { delivery_service_area_authority?: unknown }).delivery_service_area_authority
      ),
    });
  }

  const v2Ids = [...map.entries()]
    .filter(([, v]) => v.authorityMode === DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU)
    .map(([id]) => id);
  if (v2Ids.length === 0) return map;

  const { data: areas, error: areaErr } = await sb
    .from("store_delivery_service_areas")
    .select("store_id, geo_identity")
    .in("store_id", v2Ids);
  if (areaErr) throw new Error(areaErr.message);

  for (const row of areas ?? []) {
    const storeId = String((row as { store_id?: unknown }).store_id ?? "").trim();
    const geo = String((row as { geo_identity?: unknown }).geo_identity ?? "").trim();
    if (!storeId || !geo) continue;
    const slice = map.get(storeId);
    if (!slice) continue;
    slice.selectedLguIds.push(geo);
  }

  return map;
}
