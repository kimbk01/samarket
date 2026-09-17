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
import {
  classifyDeliveryRegionalListBand,
  formatApproxDeliveryDistanceKm,
  resolveDeliveryRegionalListSelectedIds,
} from "@/lib/delivery/service-area/regional-list-presentation";

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
  const authorityMode = parseDeliveryServiceAreaAuthority(store.delivery_service_area_authority);
  const storeHomeLguId = resolveStoreHomeLguId({
    cityMunicipality: store.city,
    province: store.region,
    storeLat: lat,
    storeLng: lng,
  });
  const discovered =
    lat != null && lng != null
      ? discoverDeliveryServiceAreaCandidates({
          storeLat: lat,
          storeLng: lng,
          referenceRadiusKm: store.delivery_radius_km,
          storeHomeLguId,
        })
      : [];

  const candidatesWithBands = discovered.map((c) => {
    const band = c.isStoreHome
      ? ("base" as const)
      : classifyDeliveryRegionalListBand(c.centroidDistanceKm, referenceKm, searchKm);
    return {
      geoIdentity: c.geoIdentity,
      displayName: c.displayName,
      isStoreHome: c.isStoreHome,
      centroidDistanceKm: c.centroidDistanceKm,
      approxDistanceKm: formatApproxDeliveryDistanceKm(c.centroidDistanceKm),
      inDiscoveryEnvelope: c.inDiscoveryEnvelope,
      isWithinBaseRange: band === "base",
      isWithinExtendedRange: band === "extended",
      listBand: band,
    };
  });

  const savedSelectedIds = selected.map((s) => s.geoIdentity);
  const { selectedIds: proposedSelected, selectionSource } = resolveDeliveryRegionalListSelectedIds({
    authorityMode,
    savedSelectedIds,
    candidateRows: candidatesWithBands,
  });

  const selectedGeoIdentities =
    selectionSource === "saved"
      ? [...new Set(savedSelectedIds.map((id) => String(id).trim()).filter(Boolean))].sort()
      : [...proposedSelected].sort();

  return {
    storeName: store.store_name ?? null,
    authorityMode,
    storeHomeLguId,
    storeHomeDisplayName:
      candidatesWithBands.find((c) => c.isStoreHome)?.displayName ??
      ((store.city ?? "").trim() || null),
    referenceDistanceKm: referenceKm,
    candidateSearchKm: searchKm,
    selectionSource,
    candidates: candidatesWithBands.map((c) => ({
      ...c,
      selected: proposedSelected.has(c.geoIdentity),
    })),
    selectedAreas: selected,
    selectedCount: selectedGeoIdentities.length,
    selectedGeoIdentities,
  };
}
