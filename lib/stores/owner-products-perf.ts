/**
 * GET owner store products list — slim snapshot perf.
 * @see docs/store-owner-products-perf-lock.md
 */

import { buildOwnerProductsPerfLockWarnings } from "@/lib/stores/owner-products-perf-lock";

export type OwnerProductsPerfLog = {
  auth_ms: number;
  ownership_ms: number;
  products_query_ms: number;
  categories_query_ms: number;
  sections_query_ms: number;
  payload_kb: number;
  product_count: number;
  options_embed: 0 | 1;
  images_embed: 0 | 1;
  sort_ms: number;
  serialization_ms: number;
  total_ms: number;
  /** @deprecated use products_list_cache_hit */
  cache_hit?: 0 | 1;
  singleflight_hit?: 0 | 1;
  auth_cache_hit?: 0 | 1;
  ownership_cache_hit?: 0 | 1;
  products_list_cache_hit?: 0 | 1;
  sections_cache_hit?: 0 | 1;
  categories_cache_hit?: 0 | 1;
  early_return_from_cache?: 0 | 1;
  actual_db_queries_count?: number;
  cache_lookup_ms?: number;
  route?: "owner_products_get" | "owner_products_rsc";
};

export function perfNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function jsonPayloadKb(body: unknown): number {
  try {
    return Math.round((Buffer.byteLength(JSON.stringify(body), "utf8") / 1024) * 1000) / 1000;
  } catch {
    return 0;
  }
}

export function logOwnerProductsPerf(input: OwnerProductsPerfLog): void {
  if (process.env.NODE_ENV !== "development") return;
  const products_list_cache_hit = input.products_list_cache_hit ?? input.cache_hit ?? 0;
  const payload = {
    ...input,
    products_list_cache_hit,
    cache_hit: products_list_cache_hit,
  };
  // eslint-disable-next-line no-console -- dev list-path breakdown
  console.info("[owner-products-perf]", JSON.stringify(payload));

  if (input.route !== "owner_products_get" && input.route) return;

  for (const w of buildOwnerProductsPerfLockWarnings(input)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[owner-products-perf-lock]",
      JSON.stringify({
        ...w,
        pass: w.kind === "warn" ? true : false,
        severity: w.kind === "warn" ? "warn" : "fail",
      })
    );
  }
}
