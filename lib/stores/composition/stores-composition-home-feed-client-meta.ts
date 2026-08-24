import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";

export type StoresHomeFeedClientMeta = {
  source?: string;
  compositionPolicy?: StoresHomeCompositionPolicyMeta & {
    shelfProduct?: { shelves?: unknown[] };
  };
  compositionEngine?: "live";
  [key: string]: unknown;
};

/**
 * Persist composition + shelfProduct in client cache (TTL-bound).
 * Stripping shelfProduct forced catalog defaults (e.g. food_horizontal) on remount
 * and broke Admin presentation ↔ customer HOME wiring.
 */
export function normalizeHomeFeedClientMeta(
  meta: StoresHomeFeedClientMeta | null | undefined
): StoresHomeFeedClientMeta | null {
  if (!meta) return null;
  return { ...meta };
}

/** @deprecated Use normalizeHomeFeedClientMeta — kept for import compatibility */
export function stripCompositionPolicyFromHomeFeedClientMeta(
  meta: StoresHomeFeedClientMeta | null | undefined
): StoresHomeFeedClientMeta | null {
  return normalizeHomeFeedClientMeta(meta);
}
