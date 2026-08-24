/**
 * C8 — Attach resolved HOME composition policy to home-feed API meta (fresh each response).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StoresHomeCompositionPolicyMeta,
  StoresHomePopularityOverlayMeta,
} from "@/lib/stores/composition/stores-composition-live";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  homeShelfDbRowsToOverrides,
  listHomeShelfProductDbRows,
} from "@/lib/stores/product/stores-home-shelf-product-db";
import {
  resolveHomeShelfProductCatalog,
  type StoresHomeShelfResolvedConfig,
} from "@/lib/stores/product/stores-home-shelf-product-resolve";

export type StoresHomeShelfProductMeta = {
  shelves: StoresHomeShelfResolvedConfig[];
};

export async function loadHomeFeedCompositionPolicyMeta(
  sb: SupabaseClient
): Promise<(StoresHomeCompositionPolicyMeta & { shelfProduct: StoresHomeShelfProductMeta }) | null> {
  const bundle = await loadRuntimeCompositionPolicy(sb, "home");
  const dbRows = await listHomeShelfProductDbRows(sb).catch(() => []);
  const overrides = homeShelfDbRowsToOverrides(dbRows);
  const shelves = resolveHomeShelfProductCatalog(overrides);
  return {
    rows: bundle.rows,
    overrideCount: bundle.overrideCount,
    rejectedOverrideSlots: bundle.rejectedOverrideSlots,
    engine: "live",
    shelfProduct: { shelves },
  };
}

export function attachHomeFeedCompositionPolicyMeta<T extends { meta?: Record<string, unknown> }>(
  payload: T,
  compositionPolicy: StoresHomeCompositionPolicyMeta | null
): T {
  if (!compositionPolicy) return payload;
  const overlay = (payload.meta as { popularityOverlay?: StoresHomePopularityOverlayMeta } | undefined)
    ?.popularityOverlay;
  return {
    ...payload,
    meta: {
      ...(payload.meta ?? {}),
      compositionPolicy: overlay
        ? { ...compositionPolicy, popularityOverlay: overlay }
        : compositionPolicy,
      compositionEngine: "live" as const,
    },
  };
}
