/**
 * Owner products GET — 구조 락 + env별 latency (docs/store-owner-products-perf-lock.md).
 * @typedef {'local_linked' | 'prod_same_region' | 'unknown'} EnvironmentMode
 * @typedef {'run1_cold' | 'run2_warm_transitional' | 'run3_warm' | 'after_patch_get' | 'after_patch_rewarm'} VerifyPhase
 */

/** @type {Record<EnvironmentMode, { cold_total_warn_ms: number; warm_transitional_warn_ms: number; warm_pass_total_max_ms: number; rewarm_total_max_ms: number; payload_kb_max: number }>} */
export const OWNER_PRODUCTS_PERF_SLO = {
  local_linked: {
    cold_total_warn_ms: 500,
    warm_transitional_warn_ms: 250,
    warm_pass_total_max_ms: 250,
    rewarm_total_max_ms: 50,
    payload_kb_max: 50,
  },
  prod_same_region: {
    cold_total_warn_ms: 250,
    warm_transitional_warn_ms: 150,
    warm_pass_total_max_ms: 100,
    rewarm_total_max_ms: 50,
    payload_kb_max: 50,
  },
  unknown: {
    cold_total_warn_ms: 500,
    warm_transitional_warn_ms: 250,
    warm_pass_total_max_ms: 250,
    rewarm_total_max_ms: 50,
    payload_kb_max: 50,
  },
};

/**
 * @param {{ baseUrl?: string }} [opts]
 * @returns {EnvironmentMode}
 */
export function detectOwnerProductsPerfEnvironment(opts = {}) {
  const forced = process.env.SAMARKET_PERF_ENV?.trim() || process.env.OWNER_PRODUCTS_PERF_ENV?.trim();
  if (forced === "local_linked" || forced === "prod_same_region") return forced;
  if (process.env.VERCEL === "1" || process.env.SAMARKET_DEPLOYMENT_SAME_REGION === "1") {
    return "prod_same_region";
  }
  const base = (opts.baseUrl ?? process.env.SAMARKET_BASE_URL ?? "http://127.0.0.1:3000").toLowerCase();
  if (base.includes("127.0.0.1") || base.includes("localhost")) return "local_linked";
  return "unknown";
}

/**
 * @param {Record<string, unknown>} row
 */
export function normalizeOwnerProductsPerfRow(row) {
  const products_list_cache_hit = Number(
    row.products_list_cache_hit ?? row.cache_hit ?? 0
  );
  return {
    ...row,
    products_list_cache_hit,
    cache_hit: products_list_cache_hit,
  };
}

/**
 * 구조 락 — FAIL (환경 무관).
 * @param {Record<string, unknown>} row
 * @returns {{ pass: boolean; codes: string[] }}
 */
export function evaluateOwnerProductsStructuralLock(row) {
  const r = normalizeOwnerProductsPerfRow(row);
  const codes = [];
  if (r.options_embed !== 0) codes.push("embed_still_included");
  if (r.images_embed !== 0) codes.push("embed_still_included");
  const payloadMax =
    OWNER_PRODUCTS_PERF_SLO[detectOwnerProductsPerfEnvironment()].payload_kb_max;
  if (Number(r.payload_kb) > payloadMax) codes.push("payload_too_large");
  if (
    r.products_list_cache_hit === 1 &&
    (Number(r.products_query_ms) > 0 || Number(r.sections_query_ms) > 0)
  ) {
    codes.push("list_cache_hit_but_query_ms_nonzero");
  }
  return { pass: codes.length === 0, codes };
}

/**
 * warm Run3 / rewarm PASS 조건.
 * @param {Record<string, unknown>} row
 */
export function isOwnerProductsWarmPassRow(row) {
  const r = normalizeOwnerProductsPerfRow(row);
  const structural = evaluateOwnerProductsStructuralLock(r);
  if (!structural.pass) return false;
  return (
    r.auth_cache_hit === 1 &&
    r.ownership_cache_hit === 1 &&
    r.products_list_cache_hit === 1 &&
    Number(r.products_query_ms) === 0 &&
    Number(r.sections_query_ms) === 0 &&
    Number(r.categories_query_ms) === 0 &&
    r.early_return_from_cache === 1 &&
    Number(r.actual_db_queries_count) === 0
  );
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ phase: VerifyPhase; environment?: EnvironmentMode }} ctx
 * @returns {{ pass: boolean; kind: 'pass' | 'warn' | 'fail'; codes: string[] }}
 */
export function evaluateOwnerProductsPerfLock(row, ctx) {
  const r = normalizeOwnerProductsPerfRow(row);
  const env = ctx.environment ?? detectOwnerProductsPerfEnvironment();
  const slo = OWNER_PRODUCTS_PERF_SLO[env];
  const structural = evaluateOwnerProductsStructuralLock(r);
  const codes = [...structural.codes];
  let kind = structural.pass ? "pass" : "fail";

  if (ctx.phase === "after_patch_get") {
    if (r.products_list_cache_hit !== 0) codes.push("cache_invalidate_broken");
    if (Number(r.products_query_ms) === 0 && r.products_list_cache_hit === 0) {
      /* cold refetch OK */
    }
    if (codes.length) kind = "fail";
    return { pass: kind !== "fail", kind, codes };
  }

  if (ctx.phase === "after_patch_rewarm" || ctx.phase === "run3_warm") {
    if (!isOwnerProductsWarmPassRow(r)) {
      if (r.auth_cache_hit !== 1) codes.push("auth_cache_miss");
      if (r.ownership_cache_hit !== 1) codes.push("ownership_cache_miss");
      if (r.products_list_cache_hit !== 1) codes.push("list_cache_miss");
      if (Number(r.actual_db_queries_count) > 0) codes.push("actual_db_queries_on_warm");
      if (r.early_return_from_cache !== 1) codes.push("early_return_miss");
      kind = "fail";
    }
    const totalCap =
      ctx.phase === "after_patch_rewarm" ? slo.rewarm_total_max_ms : slo.warm_pass_total_max_ms;
    if (Number(r.total_ms) > totalCap) {
      codes.push(ctx.phase === "after_patch_rewarm" ? "rewarm_slow" : "warm_pass_slow");
      kind = "fail";
    }
    return { pass: kind === "pass", kind, codes };
  }

  if (ctx.phase === "run1_cold") {
    if (r.products_list_cache_hit === 1 && Number(r.actual_db_queries_count) === 0) {
      codes.push("cold_unexpected_full_cache");
      kind = "fail";
    }
    if (Number(r.total_ms) > slo.cold_total_warn_ms) codes.push("cold_slow");
    if (r.auth_cache_hit !== 1) codes.push("auth_cold");
    if (codes.filter((c) => c !== "cold_slow" && c !== "auth_cold").length) kind = "fail";
    else if (codes.length) kind = "warn";
    return { pass: kind !== "fail", kind, codes };
  }

  if (ctx.phase === "run2_warm_transitional") {
    if (isOwnerProductsWarmPassRow(r)) {
      if (Number(r.total_ms) > slo.warm_pass_total_max_ms) {
        codes.push("warm_pass_slow");
        kind = "fail";
      }
      return { pass: kind === "pass", kind, codes };
    }
    if (r.products_list_cache_hit === 1 && Number(r.products_query_ms) === 0) {
      if (r.auth_cache_hit !== 1) codes.push("auth_transitional");
      if (Number(r.total_ms) > slo.warm_transitional_warn_ms) codes.push("warm_transitional_slow");
      kind = structural.pass ? "warn" : "fail";
      return { pass: kind !== "fail", kind, codes };
    }
    codes.push("warm_transitional_list_miss");
    kind = "fail";
    return { pass: false, kind, codes };
  }

  return { pass: structural.pass, kind: structural.pass ? "pass" : "fail", codes };
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown> | null}
 */
function parseOwnerProductsPerfPayload(raw) {
  const t = raw.trim();
  if (!t) return null;
  try {
    const first = JSON.parse(t);
    if (typeof first === "string") return JSON.parse(first);
    if (first && typeof first === "object") return first;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Next dev log wraps console JSON in an escaped quoted string; terminals use raw `{...}`.
 * @param {string} text
 * @param {number} braceStart
 * @returns {string | null}
 */
function extractBalancedJsonObject(text, braceStart) {
  if (text[braceStart] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceStart; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(braceStart, i + 1);
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} [afterMarker]
 */
export function parseOwnerProductsPerfLogs(text, afterMarker) {
  const slice =
    afterMarker && text.includes(afterMarker) ? text.slice(text.indexOf(afterMarker)) : text;
  const rows = [];
  const tag = "[owner-products-perf]";
  let pos = 0;
  while (pos < slice.length) {
    const idx = slice.indexOf(tag, pos);
    if (idx < 0) break;
    let i = idx + tag.length;
    while (i < slice.length && /\s/.test(slice[i])) i++;
    let payload = null;
    if (slice[i] === '"') {
      let j = i + 1;
      while (j < slice.length) {
        const ch = slice[j];
        if (ch === "\\" && j + 1 < slice.length) {
          j += 2;
          continue;
        }
        if (ch === '"') {
          j++;
          break;
        }
        j++;
      }
      payload = parseOwnerProductsPerfPayload(slice.slice(i, j));
      pos = j;
    } else if (slice[i] === "{") {
      const jsonText = extractBalancedJsonObject(slice, i);
      if (jsonText) {
        payload = parseOwnerProductsPerfPayload(jsonText);
        pos = i + jsonText.length;
      } else {
        pos = i + 1;
      }
    } else {
      pos = i + 1;
      continue;
    }
    if (payload) {
      const row = normalizeOwnerProductsPerfRow(payload);
      if (typeof row.early_return_from_cache === "number") rows.push(row);
    }
  }
  return rows;
}

/**
 * Dev route runtime — `[owner-products-perf-lock]` warn lines.
 * @param {Record<string, unknown>} row
 */
export function buildOwnerProductsPerfLockDevWarnings(row) {
  const r = normalizeOwnerProductsPerfRow(row);
  const out = [];
  const structural = evaluateOwnerProductsStructuralLock(r);
  for (const code of structural.codes) {
    out.push({ pass: false, code, ...r });
  }
  const env = detectOwnerProductsPerfEnvironment();
  const slo = OWNER_PRODUCTS_PERF_SLO[env];
  const warmPass = isOwnerProductsWarmPassRow(r);
  if (warmPass && Number(r.total_ms) > slo.rewarm_total_max_ms) {
    out.push({
      pass: false,
      code: "rewarm_slow",
      total_ms: r.total_ms,
      threshold_ms: slo.rewarm_total_max_ms,
    });
  }
  if (
    r.products_list_cache_hit === 1 &&
    (Number(r.products_query_ms) > 0 || Number(r.sections_query_ms) > 0)
  ) {
    out.push({
      pass: false,
      code: "list_cache_hit_but_query_ms_nonzero",
      products_query_ms: r.products_query_ms,
      sections_query_ms: r.sections_query_ms,
    });
  }
  if (!warmPass && Number(r.total_ms) > slo.cold_total_warn_ms && r.products_list_cache_hit !== 1) {
    out.push({
      pass: false,
      code: "cold_slow",
      total_ms: r.total_ms,
      threshold_ms: slo.cold_total_warn_ms,
      kind: "warn",
    });
  }
  if (
    r.products_list_cache_hit === 1 &&
    Number(r.products_query_ms) === 0 &&
    r.auth_cache_hit !== 1 &&
    Number(r.total_ms) > slo.warm_transitional_warn_ms
  ) {
    out.push({
      pass: false,
      code: "auth_transitional",
      total_ms: r.total_ms,
      auth_cache_hit: r.auth_cache_hit,
      kind: "warn",
    });
  }
  return out;
}
