/**
 * DIBAY Admin Real Operation — CUT F FULL APP PLACEMENT MAP + RUNTIME PREVIEW
 *
 * Read-model adapter over separate Delivery / Feed / Popup registries.
 * Gate: `npm run verify:admin-real-operation-cut-f-placement-map-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-f-placement-map-hard-lock.md`
 */

export const ADMIN_REAL_OPERATION_CUT_F_LOCK_ID =
  "dibay-admin-real-operation-cut-f-placement-map-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_F_LOCKED = true as const;

export const PLACEMENT_MAP_DEFINITION = {
  entry: "/admin/delivery-ads/inventory",
  hash: "placement-map",
  adapterOverSeparateRegistries: true,
  newDbForbidden: true,
  newShellRoutesForbidden: [
    "/admin/placement-map-v2",
    "/admin/ads-placement-map",
    "/admin/unified-placement",
  ] as const,
  mutationOwner: "CANONICAL_DOMAIN_ONLY" as const,
  hardcodedMarkerCoordinatesForbidden: true,
  fakeActiveCountForbidden: true,
  domainMergeForbidden: true,
} as const;

/** Flags must stay separate — never collapse into one “운영 가능”. */
export const PLACEMENT_FLAG_SEPARATION = {
  defined: true,
  sellable: true,
  runtimeSupported: true,
  previewSupported: true,
  searchTopMayBeRuntimeWithoutSellable: true,
} as const;

export const CUT_F_PRODUCTION_CARRY = {
  financeProductionE2E: "NOT_PROVEN",
  coinSaleRecognition: "NOT_PROVEN",
  deliveryAdsLive: "PARTIAL",
  resumeEndLive: "NOT_PROVEN",
  popupRuntimeProduction: "NOT_PROVEN",
  supportLive: "NOT_PROVEN",
  partnerLive: "NOT_PROVEN",
  tabletPlacementMap: "NOT_PROVEN",
  previewLiveParity: "NOT_PROVEN",
} as const;

export function assertAdminRealOperationCutFPlacementMapHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_F_LOCKED === true &&
    PLACEMENT_MAP_DEFINITION.newDbForbidden === true &&
    PLACEMENT_MAP_DEFINITION.adapterOverSeparateRegistries === true &&
    PLACEMENT_MAP_DEFINITION.mutationOwner === "CANONICAL_DOMAIN_ONLY" &&
    PLACEMENT_MAP_DEFINITION.hardcodedMarkerCoordinatesForbidden === true &&
    PLACEMENT_FLAG_SEPARATION.searchTopMayBeRuntimeWithoutSellable === true &&
    CUT_F_PRODUCTION_CARRY.popupRuntimeProduction === "NOT_PROVEN" &&
    CUT_F_PRODUCTION_CARRY.tabletPlacementMap === "NOT_PROVEN"
  );
}
