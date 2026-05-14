/**
 * Google Routes API — `computeRouteMatrix` (다수 origin→1 destination 또는 1 origin→다수 destination).
 * 서버 전용 키: `GOOGLE_MAPS_SERVER_API_KEY` 또는 레거시 `GOOGLE_MAPS_ROUTES_API_KEY`
 *
 * 목록·홈 피드에서는 호출하지 않는다(비용). 주문 직전 등 단일 구간은 `google-routes-client` 사용.
 *
 * @see https://developers.google.com/maps/documentation/routes/compute_route_matrix
 */

import { getGoogleRoutesServerApiKey, isGoogleRoutesApiGloballyDisabled } from "@/lib/geo/google-routes-client";

/** 개발 기본 권장: 목록 묶음 matrix 호출 차단 */
export function isGoogleRoutesMatrixDisabled(): boolean {
  return process.env.GOOGLE_ROUTES_MATRIX_DISABLED?.trim() === "1";
}

function devLogMatrixExpensiveCall(source: string, fields: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    console.info("[routes-api:matrix] expensive_call", JSON.stringify({ source, ...fields }));
  } catch {
    /* noop */
  }
}

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_WAYPOINTS_PER_REQUEST = 50;

export type LatLng = { lat: number; lng: number };

/** 한 구간(매장→고객 등)에 대한 Routes matrix 응답에서 뽑은 값 */
export type RouteLegMetrics = {
  rideMinutes: number | null;
  routeDistanceMeters: number | null;
};

type MatrixRow = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  status?: { code?: number; message?: string };
  condition?: string;
};

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration || typeof duration !== "string") return null;
  /** Google protobuf Duration JSON: `"592s"` 또는 `"3.5s"` (소수 초 허용) */
  const m = /^(\d+(?:\.\d+)?)s$/i.exec(duration.trim());
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec >= 0 ? sec : null;
}

function minutesCeilFromSeconds(sec: number): number {
  return Math.max(1, Math.ceil(sec / 60));
}

function readDistanceMeters(row: MatrixRow): number | null {
  const d = row.distanceMeters;
  if (typeof d === "number" && Number.isFinite(d) && d >= 0) return d;
  return null;
}

function waypointFromLatLng(p: LatLng) {
  return {
    waypoint: {
      location: {
        latLng: { latitude: p.lat, longitude: p.lng },
      },
    },
  };
}

async function postRouteMatrixManyOriginsOneDest(
  origins: LatLng[],
  destination: LatLng,
  travelMode: "TWO_WHEELER" | "DRIVE"
): Promise<RouteLegMetrics[]> {
  const n = origins.length;
  const empty = (): RouteLegMetrics => ({ rideMinutes: null, routeDistanceMeters: null });
  const out: RouteLegMetrics[] = Array.from({ length: n }, empty);
  if (isGoogleRoutesApiGloballyDisabled() || isGoogleRoutesMatrixDisabled() || n === 0) return out;
  const key = getGoogleRoutesServerApiKey();
  if (!key) return out;

  const body = {
    origins: origins.map(waypointFromLatLng),
    destinations: [waypointFromLatLng(destination)],
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
  };

  devLogMatrixExpensiveCall("postRouteMatrixManyOriginsOneDest", { origins: n, travelMode });

  let res: Response;
  try {
    res = await fetch(ROUTE_MATRIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return out;
  }

  if (!res.ok) return out;

  let rows: MatrixRow[];
  try {
    rows = (await res.json()) as MatrixRow[];
  } catch {
    return out;
  }
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    let oi = row.originIndex;
    if (typeof oi !== "number" || !Number.isFinite(oi)) {
      /** 일부 응답은 단일 origin일 때 `originIndex`를 생략한다 — 0으로 간주 */
      oi = n === 1 ? 0 : NaN;
    }
    if (!Number.isFinite(oi) || oi < 0 || oi >= n) continue;
    if (row.status?.code && row.status.code !== 0) {
      out[oi] = empty();
      continue;
    }
    const sec = parseDurationSeconds(row.duration);
    const meters = readDistanceMeters(row);
    out[oi] = {
      rideMinutes: sec != null ? minutesCeilFromSeconds(sec) : null,
      routeDistanceMeters: meters,
    };
  }
  return out;
}

async function postRouteMatrix(
  origin: LatLng,
  destinations: LatLng[],
  travelMode: "TWO_WHEELER" | "DRIVE"
): Promise<RouteLegMetrics[]> {
  const n = destinations.length;
  const empty = (): RouteLegMetrics => ({ rideMinutes: null, routeDistanceMeters: null });
  const out: RouteLegMetrics[] = Array.from({ length: n }, empty);
  if (isGoogleRoutesApiGloballyDisabled() || isGoogleRoutesMatrixDisabled() || n === 0) return out;
  const key = getGoogleRoutesServerApiKey();
  if (!key) return out;

  const body = {
    origins: [waypointFromLatLng(origin)],
    destinations: destinations.map(waypointFromLatLng),
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
  };

  devLogMatrixExpensiveCall("postRouteMatrix", { destinations: n, travelMode });

  let res: Response;
  try {
    res = await fetch(ROUTE_MATRIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return out;
  }

  if (!res.ok) {
    return out;
  }

  let rows: MatrixRow[];
  try {
    rows = (await res.json()) as MatrixRow[];
  } catch {
    return out;
  }
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    let di = row.destinationIndex;
    if (typeof di !== "number" || !Number.isFinite(di)) {
      /** 단일 destination일 때 `destinationIndex` 생략 → 0 */
      di = n === 1 ? 0 : NaN;
    }
    if (!Number.isFinite(di) || di < 0 || di >= n) continue;
    if (row.status?.code && row.status.code !== 0) {
      out[di] = empty();
      continue;
    }
    const sec = parseDurationSeconds(row.duration);
    const meters = readDistanceMeters(row);
    out[di] = {
      rideMinutes: sec != null ? minutesCeilFromSeconds(sec) : null,
      routeDistanceMeters: meters,
    };
  }
  return out;
}

/**
 * 한 origin에서 여러 destination까지 소요(분, 올림).
 * 기본 TWO_WHEELER, 전부 null이면 DRIVE 한 번 재시도.
 */
export async function fetchTwoWheelerRideMinutesMatrix(
  origin: LatLng,
  destinations: LatLng[]
): Promise<(number | null)[]> {
  const metrics = await fetchTwoWheelerRouteMetricsMatrix(origin, destinations);
  return metrics.map((m) => m.rideMinutes);
}

export async function fetchTwoWheelerRouteMetricsMatrix(
  origin: LatLng,
  destinations: LatLng[]
): Promise<RouteLegMetrics[]> {
  const n = destinations.length;
  if (n === 0) return [];

  const merged: RouteLegMetrics[] = [];
  for (let i = 0; i < n; i += MAX_WAYPOINTS_PER_REQUEST) {
    const chunk = destinations.slice(i, i + MAX_WAYPOINTS_PER_REQUEST);
    let part = await postRouteMatrix(origin, chunk, "TWO_WHEELER");
    if (part.length > 0 && part.every((x) => x.rideMinutes == null)) {
      part = await postRouteMatrix(origin, chunk, "DRIVE");
    }
    merged.push(...part);
  }
  return merged;
}

/**
 * 각 매장에서 고객 위치까지 배달 라이딩 소요(분) + 경로 거리(m).
 */
export async function fetchTwoWheelerRouteMetricsStoresToUser(
  storeCoords: LatLng[],
  user: LatLng
): Promise<RouteLegMetrics[]> {
  const n = storeCoords.length;
  if (n === 0) return [];
  const merged: RouteLegMetrics[] = [];
  for (let i = 0; i < n; i += MAX_WAYPOINTS_PER_REQUEST) {
    const chunk = storeCoords.slice(i, i + MAX_WAYPOINTS_PER_REQUEST);
    let part = await postRouteMatrixManyOriginsOneDest(chunk, user, "TWO_WHEELER");
    if (part.length > 0 && part.every((x) => x.rideMinutes == null)) {
      part = await postRouteMatrixManyOriginsOneDest(chunk, user, "DRIVE");
    }
    merged.push(...part);
  }
  return merged;
}

/**
 * 각 매장에서 고객 위치까지 배달 라이딩 소요(분).
 */
export async function fetchTwoWheelerRideMinutesStoresToUser(
  storeCoords: LatLng[],
  user: LatLng
): Promise<(number | null)[]> {
  const metrics = await fetchTwoWheelerRouteMetricsStoresToUser(storeCoords, user);
  return metrics.map((m) => m.rideMinutes);
}

type LegCacheEntry = {
  expiresAt: number;
  rideMinutes: number | null;
  routeDistanceMeters: number | null;
};
const routeLegCache = new Map<string, LegCacheEntry>();
const RIDE_CACHE_TTL_MS = 45_000;

function rideCacheKey(origin: LatLng, dest: LatLng): string {
  const oLat = origin.lat.toFixed(4);
  const oLng = origin.lng.toFixed(4);
  const dLat = dest.lat.toFixed(4);
  const dLng = dest.lng.toFixed(4);
  return `${oLat},${oLng}|${dLat},${dLng}`;
}

/**
 * 매장 id별 matrix 구간(분 + 경로 m). 캐시(TTL) + 배치 요청.
 */
export async function fetchRouteLegMetricsByStoreId(args: {
  user: LatLng;
  stores: { id: string; lat: number | null; lng: number | null }[];
}): Promise<Map<string, RouteLegMetrics>> {
  const result = new Map<string, RouteLegMetrics>();
  const pending: { id: string; lat: number; lng: number }[] = [];
  const now = Date.now();

  for (const s of args.stores) {
    const lat = s.lat;
    const lng = s.lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      result.set(s.id, { rideMinutes: null, routeDistanceMeters: null });
      continue;
    }
    const store = { lat, lng };
    const ck = rideCacheKey(store, args.user);
    const hit = routeLegCache.get(ck);
    if (hit && hit.expiresAt > now) {
      result.set(s.id, { rideMinutes: hit.rideMinutes, routeDistanceMeters: hit.routeDistanceMeters });
      continue;
    }
    pending.push({ id: s.id, lat, lng });
  }

  if (pending.length === 0) return result;

  const storeCoords = pending.map((p) => ({ lat: p.lat, lng: p.lng }));
  const metrics = await fetchTwoWheelerRouteMetricsStoresToUser(storeCoords, args.user);

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const m = metrics[i] ?? { rideMinutes: null, routeDistanceMeters: null };
    result.set(p.id, m);
    const ck = rideCacheKey({ lat: p.lat, lng: p.lng }, args.user);
    routeLegCache.set(ck, {
      expiresAt: now + RIDE_CACHE_TTL_MS,
      rideMinutes: m.rideMinutes,
      routeDistanceMeters: m.routeDistanceMeters,
    });
  }

  return result;
}

/**
 * 매장 id별 라이딩 분만 — `fetchRouteLegMetricsByStoreId` 와 동일 캐시·요청.
 */
export async function fetchRideMinutesByStoreId(args: {
  user: LatLng;
  stores: { id: string; lat: number | null; lng: number | null }[];
}): Promise<Map<string, number | null>> {
  const full = await fetchRouteLegMetricsByStoreId(args);
  const out = new Map<string, number | null>();
  for (const [id, leg] of full) {
    out.set(id, leg.rideMinutes);
  }
  return out;
}
