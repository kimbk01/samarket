import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTwoWheelerRideMinutesStoresToUser } from "@/lib/geo/google-routes-two-wheeler-matrix";
import { clampStorePrepMinutes, parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";

export type StoreOrderCheckoutEtaSnapshot = {
  checkout_prep_minutes: number | null;
  checkout_ride_minutes: number | null;
  checkout_eta_minutes: number | null;
  checkout_eta_computed_at: string | null;
};

const emptyRide: Pick<
  StoreOrderCheckoutEtaSnapshot,
  "checkout_ride_minutes" | "checkout_eta_minutes" | "checkout_eta_computed_at"
> = {
  checkout_ride_minutes: null,
  checkout_eta_minutes: null,
  checkout_eta_computed_at: null,
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

  const ulat = Number((row as { latitude?: unknown }).latitude);
  const ulng = Number((row as { longitude?: unknown }).longitude);
  if (!Number.isFinite(ulat) || !Number.isFinite(ulng)) {
    return { checkout_prep_minutes, ...emptyRide };
  }

  const [ride] = await fetchTwoWheelerRideMinutesStoresToUser(
    [{ lat: opts.storeLat, lng: opts.storeLng }],
    { lat: ulat, lng: ulng }
  );
  const checkout_ride_minutes = ride ?? null;
  const prep = prepRaw != null ? clampStorePrepMinutes(prepRaw) : 25;
  const checkout_eta_minutes = checkout_ride_minutes != null ? prep + checkout_ride_minutes : null;
  const checkout_eta_computed_at = checkout_ride_minutes != null ? new Date().toISOString() : null;

  return {
    checkout_prep_minutes,
    checkout_ride_minutes,
    checkout_eta_minutes,
    checkout_eta_computed_at,
  };
}
