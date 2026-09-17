/**
 * Shared Owner/Admin editor payload builder — identical selected/candidate semantics.
 */

import {
  discoverDeliveryServiceAreaCandidates,
  resolveRegionalCandidateSearchKm,
  resolveStoreHomeLguId,
} from "@/lib/delivery/service-area/candidate-discovery";
import type { StoreDeliveryServiceAreaRow } from "@/lib/delivery/service-area/store-delivery-service-areas";
import { parseDeliveryServiceAreaAuthority } from "@/lib/delivery/service-area/authority";
import { resolveEffectiveStoreDeliveryRadiusKm } from "@/lib/delivery/store-delivery-radius";

export type ServiceAreaEditorStoreGeo = {
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  delivery_radius_km?: number | null;
  delivery_service_area_authority?: string | null;
  store_name?: string | null;
};

export function buildDeliveryServiceAreaEditorPayload(
  store: ServiceAreaEditorStoreGeo,
  selected: StoreDeliveryServiceAreaRow[]
) {
  const lat = store.lat != null && Number.isFinite(Number(store.lat)) ? Number(store.lat) : null;
  const lng = store.lng != null && Number.isFinite(Number(store.lng)) ? Number(store.lng) : null;
  const referenceKm = resolveEffectiveStoreDeliveryRadiusKm(store.delivery_radius_km);
  const searchKm = resolveRegionalCandidateSearchKm(store.delivery_radius_km);
  const storeHomeLguId = resolveStoreHomeLguId({
    cityMunicipality: store.city,
    province: store.region,
    storeLat: lat,
    storeLng: lng,
  });
  const candidates =
    lat != null && lng != null
      ? discoverDeliveryServiceAreaCandidates({
          storeLat: lat,
          storeLng: lng,
          referenceRadiusKm: store.delivery_radius_km,
          storeHomeLguId,
        })
      : [];
  const selectedIds = new Set(selected.map((s) => s.geoIdentity));
  const proposedSelected =
    selectedIds.size > 0 ? selectedIds : new Set(storeHomeLguId ? [storeHomeLguId] : []);

  return {
    storeName: store.store_name ?? null,
    authorityMode: parseDeliveryServiceAreaAuthority(store.delivery_service_area_authority),
    storeHomeLguId,
    storeHomeDisplayName:
      candidates.find((c) => c.isStoreHome)?.displayName ??
      ((store.city ?? "").trim() || null),
    referenceDistanceKm: referenceKm,
    candidateSearchKm: searchKm,
    candidates: candidates.map((c) => ({
      ...c,
      selected: proposedSelected.has(c.geoIdentity),
    })),
    selectedAreas: selected,
    selectedCount: selectedIds.size,
    selectedGeoIdentities: [...selectedIds].sort(),
  };
}
