import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import { computeStoreOrderCheckoutEtaSnapshot } from "@/lib/stores/compute-store-order-checkout-eta-snapshot";

/** 진행 중 배달 주문만 — 완료·취소 건은 스냅샷 유지 */
const ACTIVE_DELIVERY_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
] as const;

export type StoreOrdersCheckoutGeoAfterStoreLocationSyncResult = {
  orders_updated: number;
  errors: string[];
};

/**
 * 매장 좌표 변경 후 — 진행 중 배달 주문의 ETA/거리만 재계산.
 * 배달 주소 스냅샷(`delivery_formatted_address` / `delivery_detail_address` / summary)은 불변.
 * 거리 계산은 주문에 저장된 `delivery_latitude`/`delivery_longitude` 를 쓴다.
 */
export async function refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(
  sb: SupabaseClient<any>,
  storeId: string,
): Promise<StoreOrdersCheckoutGeoAfterStoreLocationSyncResult> {
  const result: StoreOrdersCheckoutGeoAfterStoreLocationSyncResult = { orders_updated: 0, errors: [] };
  const sid = storeId.trim();
  if (!sid) return result;

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select("lat,lng,business_hours_json")
    .eq("id", sid)
    .maybeSingle();
  if (sErr || !store) {
    if (sErr) {
      result.errors.push(sErr.message);
      console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged] store", sErr.message);
    }
    return result;
  }

  const storeLat = parseFiniteLatitude(store.lat);
  const storeLng = parseFiniteLongitude(store.lng);

  const { data: orders, error } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, delivery_latitude, delivery_longitude")
    .eq("store_id", sid)
    .eq("fulfillment_type", "local_delivery")
    .in("order_status", [...ACTIVE_DELIVERY_ORDER_STATUSES]);

  if (error) {
    result.errors.push(error.message);
    console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged] select", error.message);
    return result;
  }
  if (!orders?.length) return result;

  for (const r of orders as {
    id?: unknown;
    buyer_user_id?: unknown;
    delivery_latitude?: unknown;
    delivery_longitude?: unknown;
  }[]) {
    const oid = String(r.id ?? "").trim();
    const buyerId = String(r.buyer_user_id ?? "").trim();
    if (!oid || !buyerId) continue;
    try {
      const eta = await computeStoreOrderCheckoutEtaSnapshot({
        sb,
        buyerUserId: buyerId,
        fulfillment: "local_delivery",
        deliverySnapshotLat: parseFiniteLatitude(r.delivery_latitude),
        deliverySnapshotLng: parseFiniteLongitude(r.delivery_longitude),
        storeLat,
        storeLng,
        business_hours_json: store.business_hours_json,
        skipGoogleRoutes: true,
      });
      const { error: uErr } = await sb.from("store_orders").update(eta).eq("id", oid);
      if (uErr) {
        result.errors.push(uErr.message);
        console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged] update", uErr.message);
      } else {
        result.orders_updated += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(msg);
      console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged]", e);
    }
  }

  return result;
}
