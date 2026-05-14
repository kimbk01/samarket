import { haversineKm } from "@/lib/geo/haversine-km";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const REQUEST_TIMEOUT_MS = 12_000;
const MEM_CACHE_TTL_MS = 15 * 60 * 1000;
/** 직선 거리 이하면 Google 호출 생략(delivery-eta 근접 정책과 동일) */
const NEAR_ORIGIN_STRAIGHT_METERS = 30;

export type RoutesLatLng = { lat: number; lng: number };

export type SingleLegRouteMetrics = {
  routeDistanceMeters: number | null;
  rideMinutes: number | null;
  travelModeUsed: "TWO_WHEELER" | "DRIVE" | null;
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

/** 목록 등 Routes 호출을 하지 않는 경로 — 개발 시에만 한 줄 로그 */
export function devLogRoutesSkipped(reason: string, source: string): void {
  routesApiDevLog("skipped", { source, reason });
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
  return process.env.GOOGLE_ROUTES_API_DISABLED?.trim() === "1";
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
  travelMode: "TWO_WHEELER" | "DRIVE",
  apiKey: string
): Promise<{ routeDistanceMeters: number | null; rideMinutes: number | null } | null> {
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
  };
  let res: Response;
  try {
    res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
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
  logCtx: { source: string; reason: string }
): Promise<SingleLegRouteMetrics> {
  const key = getGoogleRoutesServerApiKey();
  if (!key) {
    routesApiDevLog("skipped", {
      source: logCtx.source,
      reason: "missing_api_key",
      detailReason: logCtx.reason,
    });
    return {
      routeDistanceMeters: null,
      rideMinutes: null,
      travelModeUsed: null,
      fallbackUsed: true,
      skipReason: "missing_api_key",
    };
  }

  const t0 = Date.now();
  const two = await postComputeRoutesSingleMode(origin, destination, "TWO_WHEELER", key);
  if (two && (two.rideMinutes != null || two.routeDistanceMeters != null)) {
    routesApiDevLog("call", {
      source: logCtx.source,
      reason: logCtx.reason,
      cacheKey: stableLegCacheKey(origin, destination),
      travelMode: "TWO_WHEELER",
      durationMs: Date.now() - t0,
    });
    return { ...two, travelModeUsed: "TWO_WHEELER", fallbackUsed: false, skipReason: null };
  }
  const t1 = Date.now();
  const drive = await postComputeRoutesSingleMode(origin, destination, "DRIVE", key);
  if (drive && (drive.rideMinutes != null || drive.routeDistanceMeters != null)) {
    routesApiDevLog("call", {
      source: logCtx.source,
      reason: logCtx.reason,
      cacheKey: stableLegCacheKey(origin, destination),
      travelMode: "DRIVE",
      durationMs: Date.now() - t1,
    });
    return { ...drive, travelModeUsed: "DRIVE", fallbackUsed: true, skipReason: null };
  }
  return { routeDistanceMeters: null, rideMinutes: null, travelModeUsed: null, fallbackUsed: true, skipReason: null };
}

/**
 * Google Routes `computeRoutes` 단일 구간 — 키/비활성/좌표 검증, 메모리 캐시·single-flight.
 * 주소·전체 좌표·API 키는 로그에 넣지 않는다.
 */
export async function fetchGoogleRoutesComputeRoutesSingleLeg(
  origin: RoutesLatLng,
  destination: RoutesLatLng,
  logCtx: { source: string; reason: string }
): Promise<SingleLegRouteMetrics> {
  if (isGoogleRoutesApiGloballyDisabled()) {
    routesApiDevLog("disabled_by_env", { source: logCtx.source, reason: logCtx.reason });
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
    return {
      routeDistanceMeters: null,
      rideMinutes: null,
      travelModeUsed: null,
      fallbackUsed: true,
      skipReason: "invalid_coords",
    };
  }

  const ck = stableLegCacheKey(origin, destination);
  const straightKm = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng);
  if (straightKm != null && Number.isFinite(straightKm) && straightKm * 1000 <= NEAR_ORIGIN_STRAIGHT_METERS) {
    const v = nearOriginMetrics();
    routesApiDevLog("skipped", { source: logCtx.source, reason: "near_origin", cacheKey: ck });
    memCache.set(ck, { expiresAt: Date.now() + MEM_CACHE_TTL_MS, value: v });
    return v;
  }

  const now = Date.now();
  const hit = memCache.get(ck);
  if (hit && hit.expiresAt > now) {
    routesApiDevLog("cache_hit", { source: logCtx.source, cacheKey: ck });
    return hit.value;
  }

  const existing = inflight.get(ck);
  if (existing) return existing;

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
