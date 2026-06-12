"use client";

/**
 * R2-M11D — room RSC prefetch vs push vs flight reuse (계측 전용).
 * 켜기: sessionStorage `samarket:debug:runtime=1`
 */
import { readR2M11BPhasesSnapshot } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { samarketRuntimeDebugEnabled, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

export type R2M11DPrefetchSource = "pointerdown" | "intersection" | "pointerenter" | "post_push" | "chunk_import";

type RoomPrefetchSession = {
  roomId: string;
  href: string;
  prefetch_start_ms: number;
  router_prefetch_called_ms: number | null;
  prefetch_done_ms: number | null;
  chunk_import_done_ms: number | null;
  push_start_ms: number | null;
  push_before_prefetch_done: boolean | null;
  route_change_ms: number | null;
  suspense_release_ms: number | null;
  flight_after_route_start_ms: number | null;
  flight_after_route_done_ms: number | null;
  sources: R2M11DPrefetchSource[];
  prior_visit_count: number;
};

const K_SESSION = "samarket:cm:r2m11d:session:";
const K_VISIT = "samarket:cm:r2m11d:visit:";
const K_BREAKDOWN = "samarket:cm:r2m11d:breakdown_done:";
const K_LAST_FLIGHT = "samarket:cm:r2m11d:last_flight:";

let activeRoomId = "";
let activeHref = "";
let inflightPrefetchStart = 0;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function sessionKey(roomId: string): string {
  return K_SESSION + roomId.trim();
}

function readSession(roomId: string): RoomPrefetchSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(sessionKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as RoomPrefetchSession;
  } catch {
    return null;
  }
}

function writeSession(session: RoomPrefetchSession): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(sessionKey(session.roomId), JSON.stringify(session));
    sessionStorage.removeItem(K_BREAKDOWN + session.roomId);
  } catch {
    /* ignore */
  }
}

function visitCount(roomId: string): number {
  if (typeof sessionStorage === "undefined") return 0;
  try {
    const n = Number(sessionStorage.getItem(K_VISIT + roomId.trim()) ?? "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function bumpVisit(roomId: string): number {
  const next = visitCount(roomId) + 1;
  if (typeof sessionStorage === "undefined") return next;
  try {
    sessionStorage.setItem(K_VISIT + roomId.trim(), String(next));
  } catch {
    /* ignore */
  }
  return next;
}

function roomPathFromHref(href: string): string {
  try {
    const u = href.startsWith("http") ? new URL(href) : new URL(href, "http://local");
    return u.pathname;
  } catch {
    return href.split("?")[0] ?? href;
  }
}

function roomPathFromId(roomId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
}

export function resetR2M11DPrefetchFlightForTests(): void {
  activeRoomId = "";
  activeHref = "";
  inflightPrefetchStart = 0;
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k?.startsWith("samarket:cm:r2m11d:")) keys.push(k);
  }
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function noteR2M11DRoomPrefetchStart(
  roomId: string,
  href: string,
  source: R2M11DPrefetchSource
): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  const h = href.trim();
  if (!id || !h) return;
  activeRoomId = id;
  activeHref = h;
  const at = perfNow();
  inflightPrefetchStart = at;
  const prior = visitCount(id);
  const existing = readSession(id);
  if (existing) {
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
    if (existing.prefetch_start_ms <= 0 || at < existing.prefetch_start_ms) {
      existing.prefetch_start_ms = at;
    }
    writeSession(existing);
    return;
  }
  const session: RoomPrefetchSession = {
    roomId: id,
    href: h,
    prefetch_start_ms: at,
    router_prefetch_called_ms: null,
    prefetch_done_ms: null,
    chunk_import_done_ms: null,
    push_start_ms: null,
    push_before_prefetch_done: null,
    route_change_ms: null,
    suspense_release_ms: null,
    flight_after_route_start_ms: null,
    flight_after_route_done_ms: null,
    sources: [source],
    prior_visit_count: prior,
  };
  writeSession(session);
}

export function noteR2M11DRouterPrefetchCalled(roomId: string, href: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  const session = readSession(id);
  if (!session) return;
  session.router_prefetch_called_ms = perfNow();
  if (!session.sources.includes("pointerdown") && !session.sources.includes("post_push")) {
    session.sources.push("post_push");
  }
  writeSession(session);
}

export function noteR2M11DChunkImportDone(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const session = readSession(roomId.trim());
  if (!session || session.chunk_import_done_ms != null) return;
  session.chunk_import_done_ms = perfNow();
  if (!session.sources.includes("chunk_import")) session.sources.push("chunk_import");
  writeSession(session);
}

/** RSC `_rsc=` 요청이 room 경로에 대해 responseEnd 까지 도달 */
export function noteR2M11DRoomRscFlightDone(roomId: string, at?: number): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  const session = readSession(id);
  if (!session) return;
  const t = at ?? perfNow();
  if (session.prefetch_done_ms == null) {
    session.prefetch_done_ms = t;
  }
  writeSession(session);
}

export function observeR2M11DRoomRscFlightResource(entry: PerformanceResourceTiming): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const name = entry.name;
  if (!name.includes("_rsc=") || !name.includes("/community-messenger/rooms/")) return;
  const m = name.match(/\/community-messenger\/rooms\/([^/?%]+)/);
  const id = decodeURIComponent(m?.[1]?.trim() ?? "");
  if (!id) return;
  const end = entry.responseEnd > 0 ? entry.responseEnd : entry.startTime + entry.duration;
  const start = entry.fetchStart > 0 ? entry.fetchStart : entry.startTime;
  const session = readSession(id);
  if (!session) return;

  if (session.route_change_ms != null && start >= session.route_change_ms - 20) {
    if (session.flight_after_route_start_ms == null) session.flight_after_route_start_ms = start;
    session.flight_after_route_done_ms = end;
  } else if (session.prefetch_start_ms > 0 && start >= session.prefetch_start_ms - 50) {
    noteR2M11DRoomRscFlightDone(id, end);
  }
  writeSession(session);
}

export function noteR2M11DRoomPushStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  const session = readSession(id);
  if (!session) return;
  const at = perfNow();
  session.push_start_ms = at;
  session.push_before_prefetch_done =
    session.prefetch_done_ms != null && session.prefetch_done_ms <= at;
  writeSession(session);
}

export function noteR2M11DRoomRouteChange(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  const session = readSession(id) ?? {
    roomId: id,
    href: roomPathFromId(id),
    prefetch_start_ms: 0,
    router_prefetch_called_ms: null,
    prefetch_done_ms: null,
    chunk_import_done_ms: null,
    push_start_ms: null,
    push_before_prefetch_done: null,
    route_change_ms: perfNow(),
    suspense_release_ms: null,
    flight_after_route_start_ms: null,
    flight_after_route_done_ms: null,
    sources: [],
    prior_visit_count: visitCount(id),
  };
  session.route_change_ms = perfNow();
  writeSession(session);
}

export function tryEmitR2M11DPrefetchBreakdown(roomId: string): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  const doneKey = K_BREAKDOWN + id;
  try {
    if (sessionStorage.getItem(doneKey) === "1") return;
  } catch {
    return;
  }
  const session = readSession(id);
  if (!session || session.suspense_release_ms == null) return;

  const m11b = readR2M11BPhasesSnapshot(id);
  const routeChange = session.route_change_ms ?? m11b.route_change_start ?? null;
  const suspense = session.suspense_release_ms ?? m11b.suspense_release ?? null;
  const prefetchDone = session.prefetch_done_ms;
  const prefetchStart = session.prefetch_start_ms;

  const routeChangeToSuspense =
    routeChange != null && suspense != null ? Math.max(0, Math.round(suspense - routeChange)) : null;

  const routeChangeAfterPrefetchMs =
    prefetchDone != null && routeChange != null && prefetchDone <= routeChange
      ? Math.max(0, Math.round(routeChange - prefetchDone))
      : null;

  const roomPrefetchAgeMs =
    prefetchDone != null && prefetchStart > 0 ? Math.max(0, Math.round(prefetchDone - prefetchStart)) : null;

  const flightAfterRouteMs =
    session.flight_after_route_start_ms != null && session.flight_after_route_done_ms != null
      ? Math.max(0, Math.round(session.flight_after_route_done_ms - session.flight_after_route_start_ms))
      : null;

  const prefetchDoneBeforePush = session.push_before_prefetch_done === true;
  const flightCacheHit =
    prefetchDoneBeforePush &&
    (flightAfterRouteMs == null || flightAfterRouteMs < 80);

  const rscFlightReused = session.prior_visit_count > 0 && (flightAfterRouteMs == null || flightAfterRouteMs < 80);

  let lastFlightKey = "";
  try {
    lastFlightKey = sessionStorage.getItem(K_LAST_FLIGHT + id) ?? "";
  } catch {
    /* ignore */
  }
  const flightSignature = `${session.flight_after_route_done_ms ?? "n"}:${flightAfterRouteMs ?? "n"}`;
  const sameFlightAsLast = lastFlightKey === flightSignature && lastFlightKey.length > 0;

  try {
    sessionStorage.setItem(K_LAST_FLIGHT + id, flightSignature);
  } catch {
    /* ignore */
  }

  const roomPrefetchHit =
    prefetchDoneBeforePush ||
    (prefetchDone != null && routeChange != null && prefetchDone <= routeChange);

  const payload = {
    roomId: id,
    room_prefetch_start_ms: prefetchStart,
    room_prefetch_done_ms: prefetchDone,
    room_prefetch_hit: roomPrefetchHit,
    room_prefetch_age_ms: roomPrefetchAgeMs,
    route_push_before_prefetch_done: session.push_before_prefetch_done,
    rsc_flight_reused: rscFlightReused || sameFlightAsLast,
    flight_cache_hit: flightCacheHit,
    route_change_after_prefetch_ms: routeChangeAfterPrefetchMs,
    route_change_to_suspense_release_ms: routeChangeToSuspense,
    chunk_import_done_ms: session.chunk_import_done_ms,
    router_prefetch_called_ms: session.router_prefetch_called_ms,
    flight_after_route_ms: flightAfterRouteMs,
    prior_visit_count: session.prior_visit_count,
    prefetch_sources: session.sources,
    link_prefetch_includes_rsc:
      session.router_prefetch_called_ms != null && prefetchDone != null
        ? session.prefetch_done_ms! > session.router_prefetch_called_ms
        : null,
    framework_ceiling_candidate:
      prefetchDoneBeforePush && routeChangeToSuspense != null && routeChangeToSuspense > 200,
    session,
  };

  try {
    sessionStorage.setItem(doneKey, "1");
  } catch {
    /* ignore */
  }
  bumpVisit(id);
  samarketRuntimeDebugLog("r2-m11d", "prefetch_flight_breakdown", payload);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log(`[R2-M11D-BREAKDOWN] ${JSON.stringify(payload)}`);
  }
}

export function noteR2M11DRoomSuspenseRelease(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const session = readSession(roomId.trim());
  if (!session) return;
  session.suspense_release_ms = perfNow();
  writeSession(session);
  tryEmitR2M11DPrefetchBreakdown(roomId.trim());
}

export function getR2M11DActiveHref(): string {
  return activeHref;
}

export function getR2M11DActiveRoomId(): string {
  return activeRoomId;
}
