import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";

export type StoresHomeFeedClientMeta = {
  source?: string;
  compositionPolicy?: StoresHomeCompositionPolicyMeta;
  compositionEngine?: "live";
  [key: string]: unknown;
};

/** Composition policy is server-authoritative per request — do not persist in client feed cache. */
export function stripCompositionPolicyFromHomeFeedClientMeta(
  meta: StoresHomeFeedClientMeta | null | undefined
): StoresHomeFeedClientMeta | null {
  if (!meta) return null;
  const { compositionPolicy: _p, compositionEngine: _e, ...rest } = meta;
  return rest;
}
