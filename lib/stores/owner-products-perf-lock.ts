/**
 * Owner products GET perf lock — runtime warn (SSOT numbers: scripts/owner-products-perf-lock.mjs).
 * @see docs/store-owner-products-perf-lock.md
 */

import type { OwnerProductsPerfLog } from "@/lib/stores/owner-products-perf";

export const OWNER_PRODUCTS_PAYLOAD_KB_MAX = 50;

export const OWNER_PRODUCTS_REWARM_TOTAL_MS_LOCAL = 50;

export const OWNER_PRODUCTS_WARM_PASS_TOTAL_MS_LOCAL = 250;

export const OWNER_PRODUCTS_COLD_TOTAL_WARN_MS_LOCAL = 500;

export type OwnerProductsPerfLockWarn = {
  pass: false;
  code: string;
  kind?: "warn" | "fail";
  [key: string]: unknown;
};

function listCacheHit(row: OwnerProductsPerfLog): 0 | 1 {
  return row.products_list_cache_hit ?? row.cache_hit ?? 0;
}

function isWarmPassRow(row: OwnerProductsPerfLog): boolean {
  return (
    listCacheHit(row) === 1 &&
    row.auth_cache_hit === 1 &&
    row.ownership_cache_hit === 1 &&
    row.products_query_ms === 0 &&
    row.sections_query_ms === 0 &&
    (row.categories_query_ms ?? 0) === 0 &&
    row.early_return_from_cache === 1 &&
    (row.actual_db_queries_count ?? 1) === 0 &&
    row.options_embed === 0 &&
    row.images_embed === 0
  );
}

export function buildOwnerProductsPerfLockWarnings(
  row: OwnerProductsPerfLog
): OwnerProductsPerfLockWarn[] {
  const out: OwnerProductsPerfLockWarn[] = [];

  if (row.options_embed === 1 || row.images_embed === 1) {
    out.push({
      pass: false,
      code: "embed_still_included",
      options_embed: row.options_embed,
      images_embed: row.images_embed,
    });
  }
  if (row.payload_kb > OWNER_PRODUCTS_PAYLOAD_KB_MAX) {
    out.push({
      pass: false,
      code: "payload_too_large",
      payload_kb: row.payload_kb,
      threshold_kb: OWNER_PRODUCTS_PAYLOAD_KB_MAX,
    });
  }
  if (
    listCacheHit(row) === 1 &&
    (row.products_query_ms > 0 || row.sections_query_ms > 0)
  ) {
    out.push({
      pass: false,
      code: "list_cache_hit_but_query_ms_nonzero",
      products_query_ms: row.products_query_ms,
      sections_query_ms: row.sections_query_ms,
    });
  }

  if (isWarmPassRow(row)) {
    if (row.total_ms > OWNER_PRODUCTS_REWARM_TOTAL_MS_LOCAL) {
      out.push({
        pass: false,
        code: "rewarm_slow",
        total_ms: row.total_ms,
        threshold_ms: OWNER_PRODUCTS_REWARM_TOTAL_MS_LOCAL,
        kind: row.total_ms > OWNER_PRODUCTS_WARM_PASS_TOTAL_MS_LOCAL ? "fail" : "warn",
      });
    }
    return out;
  }

  if (listCacheHit(row) === 1 && row.products_query_ms === 0 && row.auth_cache_hit !== 1) {
    out.push({
      pass: false,
      code: "auth_transitional",
      kind: "warn",
      total_ms: row.total_ms,
      auth_cache_hit: row.auth_cache_hit,
    });
  } else if (listCacheHit(row) !== 1 && row.total_ms > OWNER_PRODUCTS_COLD_TOTAL_WARN_MS_LOCAL) {
    out.push({
      pass: false,
      code: "cold_slow",
      kind: "warn",
      total_ms: row.total_ms,
      threshold_ms: OWNER_PRODUCTS_COLD_TOTAL_WARN_MS_LOCAL,
    });
  }

  return out;
}
