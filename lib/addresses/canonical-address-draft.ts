/**
 * Address Platform V2 — in-memory draft.
 * DB mapping (NO new columns):
 *   placeName     → building_name (selected Google Place / premise only)
 *   streetAddress → street_address
 *   detail        → unit_floor_room + detail_address
 *   userLabel     → nickname (home/office may omit nickname)
 *   placeId       → place_id (selected POI identity only; never street geocode id)
 *
 * A+C contract:
 *   SEARCH PLACE SELECT = explicit POI identity
 *   PIN DRAG = delivery location refinement
 *   city/barangay/province are location metadata only — never POI boundary authority
 */

export type CanonicalIdentitySource =
  | "place_details"
  | "preferred_place"
  | "geocoder_poi"
  | "address_only";

export type CanonicalAddressDraft = {
  latitude: number;
  longitude: number;
  placeId: string | null;
  /** Real Google Place / premise name. Never formatted-address head. */
  placeName: string | null;
  placeTypes: string[];
  streetNumber: string | null;
  route: string | null;
  streetAddress: string | null;
  barangay: string | null;
  cityMunicipality: string | null;
  province: string | null;
  postalCode: string | null;
  neighborhoodName: string | null;
  formattedAddress: string | null;
  identitySource: CanonicalIdentitySource;
  samePlaceAsPreferred: boolean;
};

/** Explicit search-selected POI identity. Admin areas are NOT identity fields. */
export type CanonicalPreferredPlace = {
  placeId: string | null;
  placeName: string | null;
  placeTypes?: string[];
  originalLat?: number | null;
  originalLng?: number | null;
};

export type PinIdentityResolution =
  | { kind: "auto_keep"; draft: CanonicalAddressDraft }
  | {
      kind: "needs_resolution";
      locationDraft: CanonicalAddressDraft;
      selectedIdentity: CanonicalPreferredPlace;
    }
  | { kind: "location_only"; draft: CanonicalAddressDraft };

function cleanIdentityToken(value: string | null | undefined): string | null {
  const token = (value ?? "").replace(/\s+/g, " ").trim();
  return token || null;
}

/**
 * Search/explicit place selection is identity authority.
 * Only drafts with a real place name can seed selected POI identity.
 */
export function selectedPlaceIdentityFromDraft(
  draft: CanonicalAddressDraft | null | undefined,
): CanonicalPreferredPlace | null {
  const placeName = cleanIdentityToken(draft?.placeName);
  if (!draft || !placeName) return null;
  const identity: CanonicalPreferredPlace = {
    placeId: cleanIdentityToken(draft.placeId),
    placeName,
  };
  if (draft.placeTypes?.length) identity.placeTypes = [...draft.placeTypes];
  if (Number.isFinite(draft.latitude)) identity.originalLat = draft.latitude;
  if (Number.isFinite(draft.longitude)) identity.originalLng = draft.longitude;
  return identity;
}

/** Location-only form: no selected POI; never promote street geocode id to POI identity. */
export function stripSelectedPlaceIdentity(locationDraft: CanonicalAddressDraft): CanonicalAddressDraft {
  return {
    ...locationDraft,
    placeName: null,
    placeId: null,
    placeTypes: [],
    identitySource: "address_only",
    samePlaceAsPreferred: false,
  };
}

/** KEEP selected place: POI identity + refined pin location. */
export function applySelectedPlaceIdentity(
  locationDraft: CanonicalAddressDraft,
  selectedIdentity: CanonicalPreferredPlace,
): CanonicalAddressDraft {
  const placeName = cleanIdentityToken(selectedIdentity.placeName);
  if (!placeName) return stripSelectedPlaceIdentity(locationDraft);
  return {
    ...locationDraft,
    placeId: cleanIdentityToken(selectedIdentity.placeId),
    placeName,
    placeTypes: selectedIdentity.placeTypes ? [...selectedIdentity.placeTypes] : locationDraft.placeTypes,
    identitySource: "preferred_place",
    samePlaceAsPreferred: true,
  };
}

/**
 * Central pin-move authority for Detail + AddressSelect.
 *
 * - no selected POI → location_only
 * - samePlaceAsPreferred (viewport / placeId signal from resolver) → auto_keep
 * - selected POI but trust not proven → needs_resolution (never auto-clear / never silent-keep)
 *
 * Admin-area continuity is intentionally NOT used.
 */
export function resolvePinMoveAgainstSelectedIdentity(
  locationDraft: CanonicalAddressDraft,
  selectedIdentity: CanonicalPreferredPlace | null | undefined,
): PinIdentityResolution {
  const placeName = cleanIdentityToken(selectedIdentity?.placeName);
  if (!selectedIdentity || !placeName) {
    return { kind: "location_only", draft: stripSelectedPlaceIdentity(locationDraft) };
  }
  const identity: CanonicalPreferredPlace = {
    ...selectedIdentity,
    placeName,
    placeId: cleanIdentityToken(selectedIdentity.placeId),
  };
  if (locationDraft.samePlaceAsPreferred) {
    return { kind: "auto_keep", draft: applySelectedPlaceIdentity(locationDraft, identity) };
  }
  return {
    kind: "needs_resolution",
    locationDraft: stripSelectedPlaceIdentity(locationDraft),
    selectedIdentity: identity,
  };
}

/**
 * @deprecated Prefer resolvePinMoveAgainstSelectedIdentity.
 * Legacy callers that expected a single draft: auto_keep merges identity;
 * trust-lost returns location-only preview without silently deleting the selectedIdentity ref
 * (callers must still handle needs_resolution for prompts).
 */
export function preserveSelectedPlaceIdentity(
  locationDraft: CanonicalAddressDraft,
  selectedIdentity: CanonicalPreferredPlace | null | undefined,
): CanonicalAddressDraft {
  const resolved = resolvePinMoveAgainstSelectedIdentity(locationDraft, selectedIdentity);
  if (resolved.kind === "auto_keep") return resolved.draft;
  if (resolved.kind === "location_only") return resolved.draft;
  return resolved.locationDraft;
}
