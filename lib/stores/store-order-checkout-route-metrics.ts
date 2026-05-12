import type { RouteLegMetrics } from "@/lib/geo/google-routes-two-wheeler-matrix";
import { fetchDeliveryRouteSingleLeg } from "@/lib/geo/google-routes-single-leg";

/**
 * 체크아웃·배달 ETA: **매장 핀 1개 → 고객 핀 1개** 구간만 계산한다.
 * 단일 구간은 Google Routes `computeRoutes`로 계산한다 (`delivery-eta` · 주문 스냅샷 공통).
 */
export async function routeLegMetricsStorePinToUserPin(
  store: { lat: number; lng: number },
  user: { lat: number; lng: number }
): Promise<RouteLegMetrics> {
  const leg = await fetchDeliveryRouteSingleLeg(store, user);
  return { rideMinutes: leg.rideMinutes, routeDistanceMeters: leg.routeDistanceMeters };
}
