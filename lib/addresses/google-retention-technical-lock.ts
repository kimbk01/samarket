/**
 * Google Maps Platform retention — DIBAY decisions (technical lock).
 * Source: https://cloud.google.com/maps-platform/terms/maps-service-terms
 *
 * TECHNICAL CONFIRMED (no lawyer required to implement product behavior):
 * - place_id may be stored indefinitely.
 * - Serviceability MUST use stored canonical lat/lng — never requery Google on home/list/checkout/order.
 * - Address acquisition (Places/Geocoding/pin UX) remains the only intentional Google call surface.
 *
 * REQUIRES EXTERNAL LEGAL REVIEW before claiming PASS on long-term lat/lng storage:
 * - Places/Geocoding lat/lng default caching window is 30 consecutive calendar days.
 * - Geocoding 6.3.2 indefinite cache is narrow (end-user facing, isolated per End User, not API substitute).
 * - Store lat/lng used for many customers' serviceability likely fails that isolation exception.
 *
 * PRODUCT DIRECTION (pending legal sign-off — do not implement provider swap):
 * 1. Keep place_id as durable Google ID.
 * 2. Treat lat/lng as operational pins refreshed when Owner/Member re-confirms address (natural refresh).
 * 3. Optional future: TTL + place_id refresh job — only after legal OK.
 * 4. Forbidden: geocode on every delivery home / store list / checkout / order.
 */
export const GOOGLE_RETENTION_TECHNICAL_LOCK = {
  place_id: "indefinite_ok",
  serviceability_google_requery: "forbidden",
  lat_lng_long_term_storage: "external_legal_review_required",
  formatted_address_from_google: "external_legal_review_required",
  provider_swap: "not_authorized_this_phase",
} as const;
