/**
 * Address Platform V2 — in-memory draft.
 * DB mapping (NO new columns):
 *   placeName     → building_name (current-pin Google Place / premise only)
 *   streetAddress → street_address
 *   detail        → unit_floor_room + detail_address
 *   userLabel     → nickname (home/office may omit nickname)
 *   placeId       → place_id (current-pin POI/building only; never street geocode id)
 *
 * CURRENT PIN SSOT:
 *   SEARCH = initial pin placement only
 *   CURRENT PIN = current address authority
 *   SAVE = canonical address at the current pin
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

/** @deprecated CURRENT PIN SSOT — search identity is not authority after pin move. */
export type CanonicalPreferredPlace = {
  placeId: string | null;
  placeName: string | null;
  placeTypes?: string[];
  originalLat?: number | null;
  originalLng?: number | null;
};

/** @deprecated Removed from pin path — CURRENT PIN resolver replaces A+C KEEP/USE. */
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

/** @deprecated Prefer resolveCurrentPinCanonicalAddress — search identity is not pin authority. */
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

/** Location-only form: no POI; never promote street geocode id to POI identity. */
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

/** @deprecated CURRENT PIN SSOT — do not KEEP old search identity after pin move. */
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
 * @deprecated CURRENT PIN SSOT — pin move always re-resolves at current pin.
 * Kept only for legacy unit tests / migration window.
 */
export function resolvePinMoveAgainstSelectedIdentity(
  locationDraft: CanonicalAddressDraft,
  selectedIdentity: CanonicalPreferredPlace | null | undefined,
): PinIdentityResolution {
  const placeName = cleanIdentityToken(selectedIdentity?.placeName);
  if (!selectedIdentity || !placeName) {
    return { kind: "location_only", draft: stripSelectedPlaceIdentity(locationDraft) };
  }
  return {
    kind: "location_only",
    draft: stripSelectedPlaceIdentity(locationDraft),
  };
}

/** @deprecated */
export function preserveSelectedPlaceIdentity(
  locationDraft: CanonicalAddressDraft,
  _selectedIdentity: CanonicalPreferredPlace | null | undefined,
): CanonicalAddressDraft {
  return stripSelectedPlaceIdentity(locationDraft);
}
