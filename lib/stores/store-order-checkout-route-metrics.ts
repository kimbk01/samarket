import type { RouteLegMetrics } from "@/lib/geo/google-routes-two-wheeler-matrix";
import { fetchDeliveryRouteSingleLeg } from "@/lib/geo/google-routes-single-leg";

/**
 * 체크아웃·배달 ETA: **매장 핀 1개 → 고객 핀 1개** 구간만 계산한다.
 * 단일 구간은 Google Routes `computeRoutes`로 계산하되 개발 기본 차단·DRIVE 기본값은 `google-routes-client`가 강제한다.
 */
export async function routeLegMetricsStorePinToUserPin(
  store: { lat: number; lng: number },
  user: { lat: number; lng: number }
): Promise<RouteLegMetrics> {
  const leg = await fetchDeliveryRouteSingleLeg(store, user, {
    source: "store-order-checkout",
    reason: "order_snapshot_route",
    pathname: "/api/me/store-orders",
    component: "store-order-checkout-route-metrics",
    triggeredBy: "order_create",
  });
  return { rideMinutes: leg.rideMinutes, routeDistanceMeters: leg.routeDistanceMeters };
}
