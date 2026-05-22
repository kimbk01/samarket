/**
 * Shared perf header extraction for store detail / delivery flow measure scripts.
 */

export function readSamPerfHeaders(headers) {
  const h = headers && typeof headers.get === "function" ? headers : null;
  if (!h) return {};
  return {
    db_execution_ms: h.get("x-samarket-db-execution-ms"),
    actual_handler_ms: h.get("x-samarket-actual-handler-ms"),
    cache_hit: headers.get("x-samarket-cache-hit"),
    cache_bypass: headers.get("x-samarket-cache-bypass"),
    cache_bypass_reason: headers.get("x-samarket-cache-bypass-reason"),
    query_count: headers.get("x-samarket-query-count"),
    region: headers.get("x-samarket-region"),
    same_region: headers.get("x-samarket-same-region"),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.route
 * @param {"cold"|"warm"} opts.phase
 * @param {number} opts.client_wall_ms
 * @param {import('node:http').IncomingHttpHeaders | Headers} opts.headers
 * @param {number} [opts.status]
 */
export function formatPerfMeasureRow(opts) {
  const h = readSamPerfHeaders(opts.headers);
  return {
    url: opts.url,
    route: opts.route,
    phase: opts.phase,
    status: opts.status ?? null,
    client_wall_ms: opts.client_wall_ms,
    "x-samarket-db-execution-ms": h.db_execution_ms,
    "x-samarket-actual-handler-ms": h.actual_handler_ms,
    "x-samarket-cache-hit": h.cache_hit,
    "x-samarket-cache-bypass": h.cache_bypass,
    "x-samarket-cache-bypass-reason": h.cache_bypass_reason,
    "x-samarket-query-count": h.query_count,
    "x-samarket-region": h.region,
    "x-samarket-same-region": h.same_region,
  };
}

export async function fetchTimed(url, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store", ...opts });
  const client_wall_ms = Math.round(performance.now() - t0);
  return { res, client_wall_ms };
}

export function coldQuery() {
  return "perfCold=1";
}
