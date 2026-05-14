import {
  fetchGoogleRoutesComputeRoutesSingleLeg,
  type RoutesLatLng,
  type SingleLegRouteMetrics,
} from "@/lib/geo/google-routes-client";

export type LatLng = RoutesLatLng;
export type { SingleLegRouteMetrics };

/**
 * 매장 핀 → 고객 핀 단일 구간 `computeRoutes`.
 * 실제 HTTP는 `google-routes-client` 에서 개발 기본 차단, DRIVE 기본값, 키·캐시·single-flight 처리.
 */
export async function fetchDeliveryRouteSingleLeg(
  origin: LatLng,
  destination: LatLng,
  logCtx?: { source?: string; reason?: string; pathname?: string; component?: string; triggeredBy?: string }
): Promise<SingleLegRouteMetrics> {
  return fetchGoogleRoutesComputeRoutesSingleLeg(origin, destination, {
    source: logCtx?.source ?? "fetchDeliveryRouteSingleLeg",
    reason: logCtx?.reason ?? "single_leg",
    pathname: logCtx?.pathname,
    component: logCtx?.component,
    triggeredBy: logCtx?.triggeredBy,
  });
}
