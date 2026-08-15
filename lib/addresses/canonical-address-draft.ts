/**
 * Address Platform V2 — in-memory draft.
 * DB mapping (NO new columns):
 *   placeName     → building_name (real Google Place / premise only)
 *   streetAddress → street_address
 *   detail        → unit_floor_room + detail_address
 *   userLabel     → nickname (home/office may omit nickname)
 *   placeId       → place_id (street place_id allowed for save; not Place identity)
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

export type CanonicalPreferredPlace = {
  placeId: string | null;
  placeName: string | null;
  barangay?: string | null;
  cityMunicipality?: string | null;
  province?: string | null;
};

function cleanIdentityToken(value: string | null | undefined): string | null {
  const token = (value ?? "").replace(/\s+/g, " ").trim();
  return token || null;
}

function areaToken(value: string | null | undefined, kind?: "barangay"): string | null {
  const token = cleanIdentityToken(value);
  if (!token) return null;
  const normalized =
    kind === "barangay" ? token.replace(/^(barangay|brgy\.?)\s+/i, "") : token;
  return normalized.replace(/\s+/g, " ").trim().toLowerCase() || null;
}

function conflictingAreaToken(
  selected: string | null | undefined,
  refined: string | null | undefined,
  kind?: "barangay",
): boolean {
  const a = areaToken(selected, kind);
  const b = areaToken(refined, kind);
  return Boolean(a && b && a !== b);
}

/**
 * Search/explicit place selection is identity authority. Reverse geocode is only
 * location refinement, so only drafts with a real place name can seed identity.
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
  const barangay = cleanIdentityToken(draft.barangay);
  const cityMunicipality = cleanIdentityToken(draft.cityMunicipality);
  const province = cleanIdentityToken(draft.province);
  if (barangay) identity.barangay = barangay;
  if (cityMunicipality) identity.cityMunicipality = cityMunicipality;
  if (province) identity.province = province;
  return identity;
}

export function isSelectedPlaceIdentityConsistentWithLocation(
  locationDraft: CanonicalAddressDraft,
  selectedIdentity: CanonicalPreferredPlace | null | undefined,
): boolean {
  if (!cleanIdentityToken(selectedIdentity?.placeName)) return false;
  if (locationDraft.samePlaceAsPreferred) return true;
  if (conflictingAreaToken(selectedIdentity?.province, locationDraft.province)) return false;
  if (conflictingAreaToken(selectedIdentity?.cityMunicipality, locationDraft.cityMunicipality)) {
    return false;
  }
  if (conflictingAreaToken(selectedIdentity?.barangay, locationDraft.barangay, "barangay")) {
    return false;
  }
  return true;
}

function withoutPlaceIdentity(locationDraft: CanonicalAddressDraft): CanonicalAddressDraft {
  return {
    ...locationDraft,
    placeName: null,
    placeTypes: [],
    identitySource: "address_only",
    samePlaceAsPreferred: false,
  };
}

export function preserveSelectedPlaceIdentity(
  locationDraft: CanonicalAddressDraft,
  selectedIdentity: CanonicalPreferredPlace | null | undefined,
): CanonicalAddressDraft {
  const placeName = cleanIdentityToken(selectedIdentity?.placeName);
  if (!placeName) return locationDraft;
  if (!isSelectedPlaceIdentityConsistentWithLocation(locationDraft, selectedIdentity)) {
    return withoutPlaceIdentity(locationDraft);
  }
  const placeId = cleanIdentityToken(selectedIdentity?.placeId) ?? locationDraft.placeId;
  return {
    ...locationDraft,
    placeId,
    placeName,
    identitySource: "preferred_place",
    samePlaceAsPreferred: true,
  };
}
