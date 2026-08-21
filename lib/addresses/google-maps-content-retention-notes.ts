/**
 * Google Maps Platform content retention — DIBAY address acquisition notes.
 * Official reference: https://cloud.google.com/maps-platform/terms/maps-service-terms
 *
 * This is classification for product/legal follow-up — not runtime enforcement.
 */
export type GoogleMapsContentRetentionClass =
  | "indefinite_ok"
  | "ttl_30_days"
  | "end_user_isolated_indefinite_narrow"
  | "user_generated_candidate"
  | "external_legal_review";

export const DIBAY_ADDRESS_FIELD_RETENTION: Record<
  string,
  {
    typicalSource: string;
    retention: GoogleMapsContentRetentionClass;
    note: string;
  }
> = {
  "user_addresses.place_id": {
    typicalSource: "Places / Geocoding place_id",
    retention: "indefinite_ok",
    note: "Google ID caching explicitly allows place_id indefinitely.",
  },
  "user_addresses.latitude|longitude": {
    typicalSource: "Map pin + Places/Geocoding enrichment",
    retention: "external_legal_review",
    note: "Places/Geocoding lat/lng default TTL 30 days; pin may be user-generated but mixed with Google content — do not treat as free indefinite Google cache.",
  },
  "user_addresses.formatted_address|components": {
    typicalSource: "Places / Geocoding",
    retention: "external_legal_review",
    note: "Address strings from Google Maps Content are restricted; Geocoding 6.3.2 end-user isolation is narrow and not a blanket store-master license.",
  },
  "stores.place_id": {
    typicalSource: "Places / shop sync",
    retention: "indefinite_ok",
    note: "Same as place_id indefinite.",
  },
  "stores.lat|lng": {
    typicalSource: "Owner pin / shop-linked user_addresses sync",
    retention: "external_legal_review",
    note: "Used across many customers for serviceability — fails End-User isolation exception if treated as Geocoding 6.3.2 cache.",
  },
  "stores.formatted_address|address_*": {
    typicalSource: "Places / Owner text / sync",
    retention: "external_legal_review",
    note: "If Google-derived, retention limits apply; Owner-typed free text is separate but usually mixed in current UX.",
  },
};

/** Forbidden "fix" for retention: requery Google on every home/list/checkout/order. */
export const GOOGLE_SERVICEABILITY_REQUERY_FORBIDDEN = true as const;
