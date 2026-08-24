/**
 * CUT 0 — Taxonomy terminology ≠ browse policy.
 *
 * DB tables / API behavior unchanged. Naming boundary only.
 */

/** 1차 업종 — table: store_categories */
export const PRIMARY_INDUSTRY = "PRIMARY_INDUSTRY" as const;

/** 2차 업종 — table: store_topics (parent = store_category_id) */
export const SECONDARY_INDUSTRY = "SECONDARY_INDUSTRY" as const;

/** BROWSE surface exposure policy — table: store_browse_scope_policy (NOT taxonomy) */
export const BROWSE_SCOPE_POLICY = "BROWSE_SCOPE_POLICY" as const;

export const STORES_DISCOVERY_TAXONOMY_TERMS = [
  PRIMARY_INDUSTRY,
  SECONDARY_INDUSTRY,
  BROWSE_SCOPE_POLICY,
] as const;

export type StoresDiscoveryTaxonomyTerm = (typeof STORES_DISCOVERY_TAXONOMY_TERMS)[number];

/** Canonical table owners (documentation / type boundary — no schema change). */
export const STORES_DISCOVERY_TAXONOMY_TABLE_OWNERS = {
  PRIMARY_INDUSTRY: "store_categories",
  SECONDARY_INDUSTRY: "store_topics",
  BROWSE_SCOPE_POLICY: "store_browse_scope_policy",
} as const satisfies Record<StoresDiscoveryTaxonomyTerm, string>;

/**
 * Invariant: taxonomy definition authority ≠ browse discovery policy.
 * Do not treat Category Policy Admin as taxonomy CRUD.
 */
export const TAXONOMY_NEQ_BROWSE_SCOPE_POLICY = true as const;
