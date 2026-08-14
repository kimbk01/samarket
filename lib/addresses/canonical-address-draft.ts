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
};
