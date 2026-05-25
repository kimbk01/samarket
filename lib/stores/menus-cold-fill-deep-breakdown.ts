/**
 * Store menus cold fill — server·client 단계 분해 (관측 전용, response shape 불변).
 */
import type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";
import { isClientProdPerfLogEnabled } from "@/lib/performance/prod-same-region-perf";

export type MenusColdFillSnapshotVia = "counter_row" | "unified_rpc" | "route_memory_hit" | "unknown";

export type MenusColdFillDeepBreakdown = {
  route_total_ms: number;
  auth_ms: number;
  /** @deprecated use memory_cache_lookup_ms + snapshot_row_lookup_ms */
  cache_lookup_ms: number;
  memory_cache_lookup_ms: number;
  snapshot_row_lookup_ms: number;
  unified_rpc_ms: number;
  rpc_ms: number;
  counter_upsert_ms?: number;
  counter_upsert_blocking_ms: number;
  counter_upsert_deferred?: boolean;
  response_unblocked_by_counter?: boolean;
  payload_build_ms: number;
  json_serialize_ms: number;
  response_bytes: number;
  menu_count: number;
  option_count: number;
  image_url_count: number;
  transport_slack_ms: number;
  cache_hit: 0 | 1;
  snapshot_via: MenusColdFillSnapshotVia;
  slug: string;
  worst_stage: string | null;
  fetch_wall_ms: number | null;
  response_download_ms: number | null;
  json_parse_ms: number | null;
  client_apply_ms: number | null;
  react_render_ms: number | null;
  first_menu_visible_ms: number | null;
  first_interactable_ms: number | null;
  image_decode_ms: number | null;
  hydration_commit_ms: number | null;
  suspense_release_ms: number | null;
  client_cache_hit?: 0 | 1;
  fetch_path?: string;
};

export type MenusColdFillServerPartial = Pick<
  MenusColdFillDeepBreakdown,
  | "rpc_ms"
  | "unified_rpc_ms"
  | "cache_lookup_ms"
  | "memory_cache_lookup_ms"
  | "snapshot_row_lookup_ms"
  | "payload_build_ms"
  | "menu_count"
  | "option_count"
  | "image_url_count"
  | "snapshot_via"
  | "worst_stage"
  | "cache_hit"
  | "counter_upsert_blocking_ms"
  | "counter_upsert_deferred"
  | "response_unblocked_by_counter"
>;

export type MenusColdFillDeferredCounterUpsertLog = {
  slug: string;
  counter_upsert_deferred_ms: number;
  counter_upsert_deferred: true;
};

type MenusColdFillClientSession = {
  slug: string;
  fetchPath: string;
  navT0: number | null;
  fetchStart: number;
  fetchHeadersAt: number | null;
  fetchTextAt: number | null;
  jsonParsedAt: number | null;
  applyStartAt: number | null;
  applyEndAt: number | null;
  firstVisibleAt: number | null;
  firstInteractableAt: number | null;
  hydrationCommitAt: number | null;
  suspenseReleaseAt: number | null;
  imageDecodeMs: number | null;
  clientCacheHit: 0 | 1;
  responseBytes: number | null;
  emitted: boolean;
};

const MARK_PREFIX = "menus-cold-fill";
const clientSessions = new Map<string, MenusColdFillClientSession>();
let lastServerPartial: MenusColdFillServerPartial | null = null;

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function markName(slug: string, phase: string): string {
  return `${MARK_PREFIX}:${normalizeSlug(slug)}:${phase}`;
}

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function safeMark(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(name);
  } catch {
    /* duplicate mark */
  }
}

function safeMeasure(name: string, start: string, end: string): number | null {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return null;
  try {
    performance.measure(name, start, end);
    const entries = performance.getEntriesByName(name, "measure");
    const last = entries[entries.length - 1];
    return last ? Math.max(0, Math.round(last.duration)) : null;
  } catch {
    return null;
  }
}

function readNavT0(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("dibay:perf:nav_t0");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function measureJsonUtf8Bytes(value: unknown): number {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
    }
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return 0;
  }
}

export function countMenusCatalogStats(body: StoreMenusCatalogBody | null | undefined): {
  menu_count: number;
  option_count: number;
  image_url_count: number;
} {
  const products = Array.isArray(body?.products) ? body!.products : [];
  let option_count = 0;
  let image_url_count = 0;
  for (const item of products) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.has_options === true) {
      option_count += 1;
    } else if (row.options_json != null) {
      const oj = row.options_json;
      if (Array.isArray(oj) && oj.length > 0) option_count += 1;
      else if (typeof oj === "string" && oj.trim() && oj.trim() !== "[]" && oj.trim() !== "null") {
        option_count += 1;
      } else if (typeof oj === "object" && Object.keys(oj as object).length > 0) {
        option_count += 1;
      }
    }
    const urls = new Set<string>();
    for (const key of ["image_url", "thumbnail_url", "thumb_url"] as const) {
      const v = row[key];
      if (typeof v === "string" && v.trim()) urls.add(v.trim());
    }
    const media = row.media_urls ?? row.image_urls;
    if (Array.isArray(media)) {
      for (const u of media) {
        if (typeof u === "string" && u.trim()) urls.add(u.trim());
      }
    }
    image_url_count += urls.size;
  }
  return { menu_count: products.length, option_count, image_url_count };
}

export function setLastMenusColdFillServerPartial(partial: MenusColdFillServerPartial): void {
  lastServerPartial = partial;
}

export function peekLastMenusColdFillServerPartial(): MenusColdFillServerPartial | null {
  return lastServerPartial;
}

export function menusColdFillClientTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return (
    isClientProdPerfLogEnabled() || process.env.NEXT_PUBLIC_DIBAY_DELIVERY_PERF_TRACE === "1"
  );
}

export function logMenusColdFillDeepBreakdown(entry: MenusColdFillDeepBreakdown): void {
  // eslint-disable-next-line no-console -- menus cold fill deep breakdown
  console.info("[menus-cold-fill-deep-breakdown]", entry);
}

/** unified RPC cold path — counter row upsert 완료 후 별도 로그 (응답 경로 비블로킹). */
export function logMenusColdFillDeferredCounterUpsert(
  entry: MenusColdFillDeferredCounterUpsertLog
): void {
  // eslint-disable-next-line no-console -- menus cold fill deferred counter upsert
  console.info("[menus-cold-fill-deep-breakdown]", entry);
}

function mergeMenusColdFillLookupFields(input: {
  memory_cache_lookup_ms?: number;
  snapshot_row_lookup_ms?: number;
  serverPartial?: MenusColdFillServerPartial | null;
}): Pick<
  MenusColdFillDeepBreakdown,
  "memory_cache_lookup_ms" | "snapshot_row_lookup_ms" | "cache_lookup_ms"
> {
  const memory_cache_lookup_ms = Math.round(
    input.memory_cache_lookup_ms ?? input.serverPartial?.memory_cache_lookup_ms ?? 0
  );
  const snapshot_row_lookup_ms = Math.round(
    input.snapshot_row_lookup_ms ?? input.serverPartial?.snapshot_row_lookup_ms ?? 0
  );
  return {
    memory_cache_lookup_ms,
    snapshot_row_lookup_ms,
    cache_lookup_ms: memory_cache_lookup_ms + snapshot_row_lookup_ms,
  };
}

function getOrCreateSession(slug: string, fetchPath: string): MenusColdFillClientSession {
  const s = normalizeSlug(slug);
  const existing = clientSessions.get(s);
  if (existing) return existing;
  const session: MenusColdFillClientSession = {
    slug: s,
    fetchPath,
    navT0: readNavT0(),
    fetchStart: perfNow(),
    fetchHeadersAt: null,
    fetchTextAt: null,
    jsonParsedAt: null,
    applyStartAt: null,
    applyEndAt: null,
    firstVisibleAt: null,
    firstInteractableAt: null,
    hydrationCommitAt: null,
    suspenseReleaseAt: null,
    imageDecodeMs: null,
    clientCacheHit: 0,
    responseBytes: null,
    emitted: false,
  };
  clientSessions.set(s, session);
  return session;
}

export function beginMenusColdFillClientSession(slug: string, fetchPath: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  clientSessions.delete(s);
  const session = getOrCreateSession(s, fetchPath);
  safeMark(markName(s, "fetch_start"));
}

export function markMenusColdFillClientCacheHit(slug: string, fetchPath: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = getOrCreateSession(s, fetchPath);
  session.clientCacheHit = 1;
  session.fetchHeadersAt = session.fetchStart;
  session.fetchTextAt = session.fetchHeadersAt;
  session.jsonParsedAt = session.fetchTextAt;
}

export function markMenusColdFillFetchHeaders(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session) return;
  session.fetchHeadersAt = perfNow();
  safeMark(markName(s, "fetch_headers"));
}

export function markMenusColdFillResponseDownload(slug: string, responseBytes: number): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session) return;
  session.fetchTextAt = perfNow();
  session.responseBytes = Math.max(0, Math.round(responseBytes));
  safeMark(markName(s, "response_download"));
}

export function markMenusColdFillJsonParsed(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session) return;
  session.jsonParsedAt = perfNow();
  safeMark(markName(s, "json_parsed"));
}

export function markMenusColdFillApplyStart(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session) return;
  session.applyStartAt = perfNow();
  safeMark(markName(s, "apply_start"));
}

export function markMenusColdFillApplyEnd(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session) return;
  session.applyEndAt = perfNow();
  safeMark(markName(s, "apply_end"));
}

export function markMenusColdFillHydrationCommit(slug: string, mountT0: number | null): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = getOrCreateSession(s, "hydration");
  session.hydrationCommitAt = mountT0 != null ? perfNow() : perfNow();
  safeMark(markName(s, "hydration_commit"));
}

export function markMenusColdFillSuspenseRelease(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session || session.suspenseReleaseAt != null) return;
  session.suspenseReleaseAt = perfNow();
  safeMark(markName(s, "suspense_release"));
}

export function markMenusColdFillFirstVisible(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session || session.firstVisibleAt != null) return;
  session.firstVisibleAt = perfNow();
  safeMark(markName(s, "first_menu_visible"));
  scheduleMenusColdFillClientEmit(s);
  scheduleMenusColdFillImageDecode(s);
}

export function markMenusColdFillFirstInteractable(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session || session.firstInteractableAt != null) return;
  session.firstInteractableAt = perfNow();
  safeMark(markName(s, "first_interactable"));
  scheduleMenusColdFillClientEmit(s);
}

function scheduleMenusColdFillImageDecode(slug: string): void {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    const session = clientSessions.get(slug);
    if (!session || session.imageDecodeMs != null) return;
    const img = document.querySelector("#store-menu-panel img");
    if (!(img instanceof HTMLImageElement)) {
      session.imageDecodeMs = 0;
      scheduleMenusColdFillClientEmit(slug);
      return;
    }
    if (img.complete && img.naturalWidth > 0) {
      session.imageDecodeMs = 0;
      scheduleMenusColdFillClientEmit(slug);
      return;
    }
    const t0 = perfNow();
    void img
      .decode()
      .then(() => {
        session.imageDecodeMs = Math.max(0, Math.round(perfNow() - t0));
        scheduleMenusColdFillClientEmit(slug);
      })
      .catch(() => {
        session.imageDecodeMs = null;
        scheduleMenusColdFillClientEmit(slug);
      });
  });
}

function scheduleMenusColdFillClientEmit(slug: string): void {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => emitMenusColdFillClientBreakdown(slug));
  });
}

function sinceNavMs(session: MenusColdFillClientSession, at: number | null): number | null {
  if (at == null) return null;
  const t0 = session.navT0 ?? session.fetchStart;
  return Math.max(0, Math.round(at - t0));
}

export function emitMenusColdFillClientBreakdown(slug: string): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const s = normalizeSlug(slug);
  const session = clientSessions.get(s);
  if (!session || session.emitted) return;
  if (session.firstVisibleAt == null) return;

  session.emitted = true;

  const fetch_wall_ms =
    session.fetchHeadersAt != null
      ? Math.max(0, Math.round(session.fetchHeadersAt - session.fetchStart))
      : null;
  const response_download_ms =
    session.fetchHeadersAt != null && session.fetchTextAt != null
      ? Math.max(0, Math.round(session.fetchTextAt - session.fetchHeadersAt))
      : null;
  const json_parse_ms =
    session.fetchTextAt != null && session.jsonParsedAt != null
      ? Math.max(0, Math.round(session.jsonParsedAt - session.fetchTextAt))
      : null;
  const client_apply_ms =
    session.applyStartAt != null && session.applyEndAt != null
      ? Math.max(0, Math.round(session.applyEndAt - session.applyStartAt))
      : null;
  const react_render_ms =
    session.applyEndAt != null && session.firstVisibleAt != null
      ? Math.max(0, Math.round(session.firstVisibleAt - session.applyEndAt))
      : safeMeasure(
          `${MARK_PREFIX}:${s}:react_render`,
          markName(s, "apply_end"),
          markName(s, "first_menu_visible")
        );

  logMenusColdFillDeepBreakdownClient({
    slug: s,
    fetch_path: session.fetchPath,
    client_cache_hit: session.clientCacheHit,
    fetch_wall_ms,
    response_download_ms,
    json_parse_ms,
    client_apply_ms,
    react_render_ms,
    first_menu_visible_ms: sinceNavMs(session, session.firstVisibleAt),
    first_interactable_ms: sinceNavMs(session, session.firstInteractableAt),
    image_decode_ms: session.imageDecodeMs,
    hydration_commit_ms: sinceNavMs(session, session.hydrationCommitAt),
    suspense_release_ms: sinceNavMs(session, session.suspenseReleaseAt),
    response_bytes: session.responseBytes ?? undefined,
  });
}

export function logMenusColdFillDeepBreakdownClient(
  input: Partial<MenusColdFillDeepBreakdown> & { slug: string; fetch_path?: string }
): void {
  if (!menusColdFillClientTraceEnabled()) return;
  const serverPartial = peekLastMenusColdFillServerPartial();
  const slug = normalizeSlug(input.slug);
  logMenusColdFillDeepBreakdown({
    route_total_ms: input.route_total_ms ?? 0,
    auth_ms: input.auth_ms ?? 0,
    ...mergeMenusColdFillLookupFields({
      memory_cache_lookup_ms: input.memory_cache_lookup_ms,
      snapshot_row_lookup_ms: input.snapshot_row_lookup_ms,
      serverPartial,
    }),
    unified_rpc_ms: input.unified_rpc_ms ?? serverPartial?.unified_rpc_ms ?? serverPartial?.rpc_ms ?? 0,
    rpc_ms: input.rpc_ms ?? serverPartial?.rpc_ms ?? 0,
    payload_build_ms: input.payload_build_ms ?? serverPartial?.payload_build_ms ?? 0,
    json_serialize_ms: input.json_serialize_ms ?? 0,
    response_bytes: input.response_bytes ?? 0,
    menu_count: input.menu_count ?? serverPartial?.menu_count ?? 0,
    option_count: input.option_count ?? serverPartial?.option_count ?? 0,
    image_url_count: input.image_url_count ?? serverPartial?.image_url_count ?? 0,
    transport_slack_ms: input.transport_slack_ms ?? 0,
    cache_hit: input.cache_hit ?? serverPartial?.cache_hit ?? 0,
    snapshot_via: input.snapshot_via ?? serverPartial?.snapshot_via ?? "unknown",
    slug,
    worst_stage: input.worst_stage ?? serverPartial?.worst_stage ?? null,
    counter_upsert_blocking_ms:
      input.counter_upsert_blocking_ms ?? serverPartial?.counter_upsert_blocking_ms ?? 0,
    counter_upsert_deferred:
      input.counter_upsert_deferred ?? serverPartial?.counter_upsert_deferred,
    response_unblocked_by_counter:
      input.response_unblocked_by_counter ?? serverPartial?.response_unblocked_by_counter,
    fetch_wall_ms: input.fetch_wall_ms ?? null,
    response_download_ms: input.response_download_ms ?? null,
    json_parse_ms: input.json_parse_ms ?? null,
    client_apply_ms: input.client_apply_ms ?? null,
    react_render_ms: input.react_render_ms ?? null,
    first_menu_visible_ms: input.first_menu_visible_ms ?? null,
    first_interactable_ms: input.first_interactable_ms ?? null,
    image_decode_ms: input.image_decode_ms ?? null,
    hydration_commit_ms: input.hydration_commit_ms ?? null,
    suspense_release_ms: input.suspense_release_ms ?? null,
    client_cache_hit: input.client_cache_hit,
    fetch_path: input.fetch_path,
  });
}

export function logMenusColdFillDeepBreakdownRoute(input: {
  handlerT0: number;
  auth_ms: number;
  memory_cache_lookup_ms?: number;
  snapshot_row_lookup_ms?: number;
  /** @deprecated route-level legacy — prefer memory_cache_lookup_ms */
  cache_lookup_ms?: number;
  payload_build_ms: number;
  cache_hit: boolean;
  slug: string;
  body: StoreMenusCatalogBody | Record<string, unknown>;
  snapshotVia?: MenusColdFillSnapshotVia;
  worst_stage?: string | null;
}): void {
  const useServerPartial =
    !input.cache_hit && input.snapshotVia !== "route_memory_hit";
  const serverPartial = useServerPartial ? peekLastMenusColdFillServerPartial() : null;
  const lookup = mergeMenusColdFillLookupFields({
    memory_cache_lookup_ms:
      input.memory_cache_lookup_ms ?? input.cache_lookup_ms ?? 0,
    snapshot_row_lookup_ms: input.snapshot_row_lookup_ms,
    serverPartial,
  });
  const counts = countMenusCatalogStats(input.body as StoreMenusCatalogBody);
  const serialize0 = perfNow();
  JSON.stringify(input.body);
  const json_serialize_ms = Math.round(perfNow() - serialize0);
  const response_bytes = measureJsonUtf8Bytes(input.body);
  const route_total_ms = Math.round(perfNow() - input.handlerT0);
  const unified_rpc_ms = serverPartial?.unified_rpc_ms ?? serverPartial?.rpc_ms ?? 0;
  const rpc_ms = serverPartial?.rpc_ms ?? unified_rpc_ms;
  const payload_build_ms = Math.round(
    input.payload_build_ms + (serverPartial?.payload_build_ms ?? 0)
  );
  const counter_upsert_blocking_ms = serverPartial?.counter_upsert_blocking_ms ?? 0;
  const transport_slack_ms = Math.max(
    0,
    route_total_ms -
      input.auth_ms -
      lookup.memory_cache_lookup_ms -
      lookup.snapshot_row_lookup_ms -
      unified_rpc_ms -
      payload_build_ms -
      json_serialize_ms -
      counter_upsert_blocking_ms
  );
  logMenusColdFillDeepBreakdown({
    route_total_ms,
    auth_ms: input.auth_ms,
    ...lookup,
    unified_rpc_ms,
    rpc_ms,
    payload_build_ms,
    json_serialize_ms,
    response_bytes,
    menu_count: serverPartial?.menu_count ?? counts.menu_count,
    option_count: serverPartial?.option_count ?? counts.option_count,
    image_url_count: serverPartial?.image_url_count ?? counts.image_url_count,
    transport_slack_ms,
    cache_hit: input.cache_hit ? 1 : 0,
    snapshot_via: input.snapshotVia ?? serverPartial?.snapshot_via ?? "unknown",
    slug: normalizeSlug(input.slug),
    worst_stage: serverPartial?.worst_stage ?? input.worst_stage ?? null,
    counter_upsert_blocking_ms,
    counter_upsert_deferred: serverPartial?.counter_upsert_deferred,
    response_unblocked_by_counter: serverPartial?.response_unblocked_by_counter,
    fetch_wall_ms: null,
    response_download_ms: null,
    json_parse_ms: null,
    client_apply_ms: null,
    react_render_ms: null,
    first_menu_visible_ms: null,
    first_interactable_ms: null,
    image_decode_ms: null,
    hydration_commit_ms: null,
    suspense_release_ms: null,
  });
}

export function resetMenusColdFillDeepBreakdownForTests(): void {
  lastServerPartial = null;
  clientSessions.clear();
}
