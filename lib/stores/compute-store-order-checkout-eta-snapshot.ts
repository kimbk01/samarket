import type { SupabaseClient } from "@supabase/supabase-js";
import { clampStorePrepMinutes, parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import { routeLegMetricsStorePinToUserPin } from "@/lib/stores/store-order-checkout-route-metrics";
import { haversineKm } from "@/lib/geo/haversine-km";

export type StoreOrderCheckoutEtaSnapshot = {
  checkout_prep_minutes: number | null;
  checkout_ride_minutes: number | null;
  checkout_eta_minutes: number | null;
  checkout_eta_computed_at: string | null;
  /** Routes `computeRoutes` 거리(m) — ride 분과 동일 출처 */
  checkout_route_distance_meters: number | null;
  checkout_straight_distance_meters: number | null;
};

const emptyRide: Pick<
  StoreOrderCheckoutEtaSnapshot,
  | "checkout_ride_minutes"
  | "checkout_eta_minutes"
  | "checkout_eta_computed_at"
  | "checkout_route_distance_meters"
  | "checkout_straight_distance_meters"
> = {
  checkout_ride_minutes: null,
  checkout_eta_minutes: null,
  checkout_eta_computed_at: null,
  checkout_route_distance_meters: null,
  checkout_straight_distance_meters: null,
};

/**
 * 배달 주문 생성 시 DB에 넣을 ETA 스냅샷.
 * `delivery_user_address_id` 가 없거나 좌표가 없으면 라이딩은 null.
 */
export async function computeStoreOrderCheckoutEtaSnapshot(opts: {
  sb: SupabaseClient;
  buyerUserId: string;
  fulfillment: string;
  deliveryUserAddressId?: string | null;
  storeLat: number | null;
  storeLng: number | null;
  business_hours_json: unknown;
  /** true면 주소 동기화 등 — Google Routes 호출 없이 직선거리만 채움 */
  skipGoogleRoutes?: boolean;
}): Promise<StoreOrderCheckoutEtaSnapshot> {
  const extras = parseCommerceExtrasFromHoursJson(opts.business_hours_json);
  const prepRaw = extras.prepMinutes;
  const checkout_prep_minutes =
    prepRaw != null && Number.isFinite(prepRaw) ? clampStorePrepMinutes(prepRaw) : null;

  if (opts.fulfillment !== "local_delivery") {
    return { checkout_prep_minutes, ...emptyRide };
  }

  const addrId = opts.deliveryUserAddressId?.trim();
  if (!addrId || opts.storeLat == null || opts.storeLng == null) {
    return { checkout_prep_minutes, ...emptyRide };
  }

  const { data: row, error } = await opts.sb
    .from("user_addresses")
    .select("user_id, latitude, longitude")
    .eq("id", addrId)
    .maybeSingle();

  if (error || !row) {
    return { checkout_prep_minutes, ...emptyRide };
  }
  if (String((row as { user_id?: string }).user_id ?? "") !== opts.buyerUserId) {
    return { checkout_prep_minutes, ...emptyRide };
  }

  const addrRow = row as { latitude?: unknown; longitude?: unknown };
  const ulat = parseFiniteLatitude(addrRow.latitude);
  const ulng = parseFiniteLongitude(addrRow.longitude);
  const slat = parseFiniteLatitude(opts.storeLat);
  const slng = parseFiniteLongitude(opts.storeLng);
  if (ulat == null || ulng == null || slat == null || slng == null) {
    return { checkout_prep_minutes, ...emptyRide };
  }

  const straightKm = haversineKm(slat, slng, ulat, ulng);
  const checkout_straight_distance_meters =
    straightKm != null && Number.isFinite(straightKm) && straightKm >= 0 ? Math.round(straightKm * 1000) : null;

  if (opts.skipGoogleRoutes === true) {
    return {
      checkout_prep_minutes,
      checkout_ride_minutes: null,
      checkout_eta_minutes: null,
      checkout_eta_computed_at: null,
      checkout_route_distance_meters: null,
      checkout_straight_distance_meters,
    };
  }

  const m = await routeLegMetricsStorePinToUserPin({ lat: slat, lng: slng }, { lat: ulat, lng: ulng });
  const checkout_ride_minutes = m.rideMinutes ?? null;
  const dm = m.routeDistanceMeters;
  const checkout_route_distance_meters =
    dm != null && Number.isFinite(dm) && dm >= 0 ? Math.round(dm) : null;
  const prep = prepRaw != null ? clampStorePrepMinutes(prepRaw) : 25;
  const checkout_eta_minutes = checkout_ride_minutes != null ? prep + checkout_ride_minutes : null;
  const checkout_eta_computed_at =
    checkout_ride_minutes != null || checkout_route_distance_meters != null
      ? new Date().toISOString()
      : null;

  return {
    checkout_prep_minutes,
    checkout_ride_minutes,
    checkout_eta_minutes,
    checkout_eta_computed_at,
    checkout_route_distance_meters,
    checkout_straight_distance_meters,
  };
}
