import { haversineKm } from "@/lib/geo/haversine-km";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const REQUEST_TIMEOUT_MS = 12_000;
const MEM_CACHE_TTL_MS = 15 * 60 * 1000;
/** 직선 거리 이하면 Google 호출 생략(delivery-eta 근접 정책과 동일) */
const NEAR_ORIGIN_STRAIGHT_METERS = 30;
const ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters";

export type RoutesLatLng = { lat: number; lng: number };
type RoutesTravelMode = "TWO_WHEELER" | "DRIVE";

type RoutesTraceContext = {
  source: string;
  reason: string;
  pathname?: string;
  component?: string;
  triggeredBy?: string;
};

export type SingleLegRouteMetrics = {
  routeDistanceMeters: number | null;
  rideMinutes: number | null;
  travelModeUsed: RoutesTravelMode | null;
  fallbackUsed: boolean;
  /** Google 호출을 하지 않은 사유(관측·API 응답 확장용) */
  skipReason?: "disabled_by_env" | "missing_api_key" | "invalid_coords" | "near_origin" | null;
};

type ComputeRoutesResponse = {
  routes?: {
    duration?: string;
    distanceMeters?: number;
  }[];
};

/** development 전용 — 키·전체 주소·원시 좌표 미출력 */
function routesApiDevLog(event: string, fields: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    console.info(`[routes-api] ${event}`, JSON.stringify(fields));
  } catch {
    /* noop */
  }
}

function envFlagEnabled(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function maskedCoord(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function maskedLatLng(p: RoutesLatLng): { latitude: number | null; longitude: number | null } {
  return { latitude: maskedCoord(p.lat), longitude: maskedCoord(p.lng) };
}

function maskedRequestBody(body: {
  origin: { location: { latLng: { latitude: number; longitude: number } } };
  destination: { location: { latLng: { latitude: number; longitude: number } } };
  travelMode: RoutesTravelMode;
  routingPreference?: "TRAFFIC_AWARE";
  computeAlternativeRoutes: false;
}): Record<string, unknown> {
  return {
    ...body,
    origin: { location: { latLng: maskedLatLng({ lat: body.origin.location.latLng.latitude, lng: body.origin.location.latLng.longitude }) } },
    destination: { location: { latLng: maskedLatLng({ lat: body.destination.location.latLng.latitude, lng: body.destination.location.latLng.longitude }) } },
  };
}

function googleCallSkippedLog(fields: {
  reason: string;
  caller: string;
  duplicateKey?: string | null;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    console.info("[GOOGLE_CALL_SKIPPED]", JSON.stringify({
      reason: fields.reason,
      caller: fields.caller,
      duplicateKey: fields.duplicateKey ?? null,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    /* noop */
  }
}

function routesRequestBodyLog(fields: {
  url: string;
  fieldMask: string;
  body: Record<string, unknown>;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  const body = fields.body as {
    routingPreference?: unknown;
    extraComputations?: unknown;
    routeModifiers?: unknown;
    polylineQuality?: unknown;
    polylineEncoding?: unknown;
    computeAlternativeRoutes?: unknown;
    optimizeWaypointOrder?: unknown;
    units?: unknown;
    languageCode?: unknown;
  };
  try {
    console.info(
      "[ROUTES_REQUEST_BODY]",
      JSON.stringify({
        url: fields.url,
        headers: {
          "X-Goog-FieldMask": fields.fieldMask,
        },
        body: fields.body,
        routingPreference: body.routingPreference ?? null,
        extraComputations: body.extraComputations ?? null,
        routeModifiers: body.routeModifiers ?? null,
        polylineQuality: body.polylineQuality ?? null,
        polylineEncoding: body.polylineEncoding ?? null,
        computeAlternativeRoutes: body.computeAlternativeRoutes ?? null,
        optimizeWaypointOrder: body.optimizeWaypointOrder ?? null,
        units: body.units ?? null,
        languageCode: body.languageCode ?? null,
      })
    );
  } catch {
    /* noop */
  }
}

function googleBillableCallLog(fields: {
  skuCandidate: "essentials" | "pro" | "enterprise";
  travelMode: RoutesTravelMode;
  routingPreference: "TRAFFIC_AWARE" | null;
  caller: string;
  pathname: string;
  duplicateKey: string;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    console.info("[GOOGLE_BILLABLE_CALL]", JSON.stringify({
      api: "routes",
      skuCandidate: fields.skuCandidate,
      travelMode: fields.travelMode,
      routingPreference: fields.routingPreference,
      fieldMask: ROUTES_FIELD_MASK,
      caller: fields.caller,
      pathname: fields.pathname,
      duplicateKey: fields.duplicateKey,
      cacheHit: false,
      inflightHit: false,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    /* noop */
  }
}

function routeTraceCoord(p: RoutesLatLng): string {
  return `${roundKey4(p.lat)},${roundKey4(p.lng)}`;
}

function routesTraceLog(
  fields: RoutesTraceContext & {
    event: string;
    origin?: RoutesLatLng;
    destination?: RoutesLatLng;
    duplicateKey?: string | null;
    cacheHit: boolean;
    travelMode?: "TWO_WHEELER" | "DRIVE" | "single_leg" | null;
  }
): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    console.info(
      "[ROUTES_TRACE]",
      JSON.stringify({
        pathname: fields.pathname ?? fields.source,
        component: fields.component ?? fields.source,
        reason: fields.reason,
        origin: fields.origin ? routeTraceCoord(fields.origin) : null,
        destination: fields.destination ? routeTraceCoord(fields.destination) : null,
        triggeredBy: fields.triggeredBy ?? fields.reason,
        duplicateKey: fields.duplicateKey ?? null,
        cacheHit: fields.cacheHit,
        devMode: true,
        timestamp: new Date().toISOString(),
        event: fields.event,
        travelMode: fields.travelMode ?? null,
      })
    );
  } catch {
    /* noop */
  }
}

/** 목록 등 Routes 호출을 하지 않는 경로 — 개발 시에만 한 줄 로그 */
export function devLogRoutesSkipped(reason: string, source: string): void {
  routesApiDevLog("skipped", { source, reason });
  googleCallSkippedLog({ reason, caller: source });
  routesTraceLog({
    source,
    reason,
    event: "skipped",
    duplicateKey: null,
    cacheHit: false,
    travelMode: null,
  });
}

function roundKey4(n: number): string {
  return (Math.round(n * 1e4) / 1e4).toString();
}

function stableLegCacheKey(origin: RoutesLatLng, destination: RoutesLatLng): string {
  return `${roundKey4(origin.lat)},${roundKey4(origin.lng)}|${roundKey4(destination.lat)},${roundKey4(destination.lng)}`;
}

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const m = /^(\d+(?:\.\d+)?)s$/i.exec(duration.trim());
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec >= 0 ? sec : null;
}

function minutesCeil(sec: number): number {
  return Math.max(1, Math.ceil(sec / 60));
}

export function isGoogleRoutesApiGloballyDisabled(): boolean {
  const raw = process.env.GOOGLE_ROUTES_API_DISABLED?.trim();
  if (raw === "0") return false;
  if (raw === "1") return true;
  return process.env.NODE_ENV === "development";
}

function getGoogleRoutesTravelMode(): RoutesTravelMode {
  const requested = process.env.GOOGLE_ROUTES_TRAVEL_MODE?.trim().toUpperCase();
  if (requested === "TWO_WHEELER" && envFlagEnabled("GOOGLE_ROUTES_ALLOW_TWO_WHEELER")) {
    return "TWO_WHEELER";
  }
  return "DRIVE";
}

function getGoogleRoutesRoutingPreference(): "TRAFFIC_AWARE" | null {
  return envFlagEnabled("GOOGLE_ROUTES_TRAFFIC_AWARE") ? "TRAFFIC_AWARE" : null;
}

function skuCandidateForRequest(travelMode: RoutesTravelMode, routingPreference: "TRAFFIC_AWARE" | null): "essentials" | "pro" | "enterprise" {
  if (travelMode === "TWO_WHEELER") return "enterprise";
  if (routingPreference === "TRAFFIC_AWARE") return "pro";
  return "essentials";
}

/**
 * 단일 구간 computeRoutes 캐시·dedupe 키에 포함 — `GOOGLE_ROUTES_*` 변경 시 이전 응답 재사용 방지.
 * (좌표만으로는 DRIVE↔TWO_WHEELER·traffic 전환 시 잘못된 cache hit 가능)
 */
export function getGoogleRoutesComputeLegRequestSegment(): string {
  const mode = getGoogleRoutesTravelMode();
  const ta = getGoogleRoutesRoutingPreference() ? "TA" : "noTA";
  return `${mode}|${ta}`;
}

function computeLegMemCacheKey(origin: RoutesLatLng, destination: RoutesLatLng): string {
  return `${stableLegCacheKey(origin, destination)}|${getGoogleRoutesComputeLegRequestSegment()}`;
}

/** 서버 전용 Routes 키 — 레거시 `GOOGLE_MAPS_ROUTES_API_KEY` 호환 */
export function getGoogleRoutesServerApiKey(): string | null {
  const k =
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_ROUTES_SERVER_KEY?.trim();
  return k || null;
}

function validateLegEndpoints(origin: RoutesLatLng, destination: RoutesLatLng): boolean {
  return (
    parseFiniteLatitude(origin.lat) != null &&
    parseFiniteLongitude(origin.lng) != null &&
    parseFiniteLatitude(destination.lat) != null &&
    parseFiniteLongitude(destination.lng) != null
  );
}

type MemEntry = { expiresAt: number; value: SingleLegRouteMetrics };
const memCache = new Map<string, MemEntry>();
const inflight = new Map<string, Promise<SingleLegRouteMetrics>>();

function nearOriginMetrics(): SingleLegRouteMetrics {
  return {
    routeDistanceMeters: 0,
    rideMinutes: 0,
    travelModeUsed: null,
    fallbackUsed: false,
    skipReason: "near_origin",
  };
}

async function postComputeRoutesSingleMode(
  origin: RoutesLatLng,
  destination: RoutesLatLng,
  travelMode: RoutesTravelMode,
  apiKey: string,
  logCtx: RoutesTraceContext,
  duplicateKey: string
): Promise<{ routeDistanceMeters: number | null; rideMinutes: number | null } | null> {
  const routingPreference = getGoogleRoutesRoutingPreference();
  const body: {
    origin: { location: { latLng: { latitude: number; longitude: number } } };
    destination: { location: { latLng: { latitude: number; longitude: number } } };
    travelMode: RoutesTravelMode;
    routingPreference?: "TRAFFIC_AWARE";
    computeAlternativeRoutes: false;
  } = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode,
    computeAlternativeRoutes: false,
  };
  if (routingPreference) body.routingPreference = routingPreference;
  routesRequestBodyLog({
    url: ROUTES_URL,
    fieldMask: ROUTES_FIELD_MASK,
    body: maskedRequestBody(body),
  });
  let res: Response;
  try {
    res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: ComputeRoutesResponse;
  try {
    json = (await res.json()) as ComputeRoutesResponse;
  } catch {
    return null;
  }
  /** Google 과금은 보통 HTTP 200 성공 요청 기준 — 실패·파싱 실패 시 billable 로그 생략 */
  googleBillableCallLog({
    skuCandidate: skuCandidateForRequest(travelMode, routingPreference),
    travelMode,
    routingPreference,
    caller: logCtx.component ?? logCtx.source,
    pathname: logCtx.pathname ?? logCtx.source,
    duplicateKey,
  });
  const route = json.routes?.[0];
  if (!route) return null;
  const seconds = parseDurationSeconds(route.duration);
  const dm = route.distanceMeters;
  return {
    routeDistanceMeters: typeof dm === "number" && Number.isFinite(dm) && dm >= 0 ? Math.round(dm) : null,
    rideMinutes: seconds != null ? minutesCeil(seconds) : null,
  };
}

async function computeRoutesSingleLegNetwork(
  origin: RoutesLatLng,
  destination: RoutesLatLng,
  logCtx: RoutesTraceContext
): Promise<SingleLegRouteMetrics> {
  const key = getGoogleRoutesServerApiKey();
  if (!key) {
    routesApiDevLog("skipped", {
      source: logCtx.source,
      reason: "missing_api_key",
      detailReason: logCtx.reason,
    });
    googleCallSkippedLog({
      reason: "missing_api_key",
      caller: logCtx.component ?? logCtx.source,
      duplicateKey: computeLegMemCacheKey(origin, destination),
    });
    routesTraceLog({
      ...logCtx,
      event: "skipped_missing_api_key",
      origin,
      destination,
      duplicateKey: computeLegMemCacheKey(origin, destination),
      cacheHit: false,
      travelMode: "single_leg",
    });
    return {
      routeDistanceMeters: null,
      rideMinutes: null,
      travelModeUsed: null,
      fallbackUsed: true,
      skipReason: "missing_api_key",
    };
  }

  const cacheKey = computeLegMemCacheKey(origin, destination);
  const travelMode = getGoogleRoutesTravelMode();
  const t0 = Date.now();
  const leg = await postComputeRoutesSingleMode(origin, destination, travelMode, key, logCtx, cacheKey);
  if (leg && (leg.rideMinutes != null || leg.routeDistanceMeters != null)) {
    routesApiDevLog("call", {
      source: logCtx.source,
      reason: logCtx.reason,
      cacheKey,
      travelMode,
      durationMs: Date.now() - t0,
    });
    routesTraceLog({
      ...logCtx,
      event: "network_call",
      origin,
      destination,
      duplicateKey: cacheKey,
      cacheHit: false,
      travelMode,
    });
    return { ...leg, travelModeUsed: travelMode, fallbackUsed: false, skipReason: null };
  }
  routesTraceLog({
    ...logCtx,
    event: "network_empty",
    origin,
    destination,
    duplicateKey: cacheKey,
    cacheHit: false,
    travelMode: "single_leg",
  });
  return { routeDistanceMeters: null, rideMinutes: null, travelModeUsed: null, fallbackUsed: true, skipReason: null };
}

/**
 * Google Routes `computeRoutes` 단일 구간 — 키/비활성/좌표 검증, 메모리 캐시·single-flight.
 * 주소·전체 좌표·API 키는 로그에 넣지 않는다.
 */
export async function fetchGoogleRoutesComputeRoutesSingleLeg(
  origin: RoutesLatLng,
  destination: RoutesLatLng,
  logCtx: RoutesTraceContext
): Promise<SingleLegRouteMetrics> {
  if (isGoogleRoutesApiGloballyDisabled()) {
    routesApiDevLog("disabled_by_env", { source: logCtx.source, reason: logCtx.reason });
    googleCallSkippedLog({
      reason: "google_routes_disabled",
      caller: logCtx.component ?? logCtx.source,
      duplicateKey: computeLegMemCacheKey(origin, destination),
    });
    routesTraceLog({
      ...logCtx,
      event: "disabled_by_env",
      origin,
      destination,
      duplicateKey: computeLegMemCacheKey(origin, destination),
      cacheHit: false,
      travelMode: "single_leg",
    });
    return {
      routeDistanceMeters: null,
      rideMinutes: null,
      travelModeUsed: null,
      fallbackUsed: true,
      skipReason: "disabled_by_env",
    };
  }

  if (!validateLegEndpoints(origin, destination)) {
    routesApiDevLog("skipped", { source: logCtx.source, reason: "invalid_coords", detailReason: logCtx.reason });
    googleCallSkippedLog({
      reason: "invalid_coords",
      caller: logCtx.component ?? logCtx.source,
      duplicateKey: null,
    });
    routesTraceLog({
      ...logCtx,
      event: "skipped_invalid_coords",
      origin,
      destination,
      duplicateKey: null,
      cacheHit: false,
      travelMode: "single_leg",
    });
    return {
      routeDistanceMeters: null,
      rideMinutes: null,
      travelModeUsed: null,
      fallbackUsed: true,
      skipReason: "invalid_coords",
    };
  }

  const ck = computeLegMemCacheKey(origin, destination);
  const straightKm = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng);
  if (straightKm != null && Number.isFinite(straightKm) && straightKm * 1000 <= NEAR_ORIGIN_STRAIGHT_METERS) {
    const v = nearOriginMetrics();
    routesApiDevLog("skipped", { source: logCtx.source, reason: "near_origin", cacheKey: ck });
    googleCallSkippedLog({
      reason: "near_origin",
      caller: logCtx.component ?? logCtx.source,
      duplicateKey: ck,
    });
    routesTraceLog({
      ...logCtx,
      event: "skipped_near_origin",
      origin,
      destination,
      duplicateKey: ck,
      cacheHit: false,
      travelMode: "single_leg",
    });
    memCache.set(ck, { expiresAt: Date.now() + MEM_CACHE_TTL_MS, value: v });
    return v;
  }

  const now = Date.now();
  const hit = memCache.get(ck);
  if (hit && hit.expiresAt > now) {
    routesApiDevLog("cache_hit", { source: logCtx.source, cacheKey: ck });
    googleCallSkippedLog({
      reason: "cache_hit",
      caller: logCtx.component ?? logCtx.source,
      duplicateKey: ck,
    });
    routesTraceLog({
      ...logCtx,
      event: "cache_hit",
      origin,
      destination,
      duplicateKey: ck,
      cacheHit: true,
      travelMode: "single_leg",
    });
    return hit.value;
  }

  const existing = inflight.get(ck);
  if (existing) {
    googleCallSkippedLog({
      reason: "inflight_hit",
      caller: logCtx.component ?? logCtx.source,
      duplicateKey: ck,
    });
    routesTraceLog({
      ...logCtx,
      event: "inflight_hit",
      origin,
      destination,
      duplicateKey: ck,
      cacheHit: true,
      travelMode: "single_leg",
    });
    return existing;
  }

  const flight = (async () => {
    const value = await computeRoutesSingleLegNetwork(origin, destination, logCtx);
    memCache.set(ck, { expiresAt: Date.now() + MEM_CACHE_TTL_MS, value });
    return value;
  })().finally(() => {
    inflight.delete(ck);
  });

  inflight.set(ck, flight);
  return flight;
}
