/**
 * C8 — Attach resolved HOME composition policy to home-feed API meta (fresh each response).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";

export async function loadHomeFeedCompositionPolicyMeta(
  sb: SupabaseClient
): Promise<StoresHomeCompositionPolicyMeta | null> {
  const bundle = await loadRuntimeCompositionPolicy(sb, "home");
  return {
    rows: bundle.rows,
    overrideCount: bundle.overrideCount,
    rejectedOverrideSlots: bundle.rejectedOverrideSlots,
    engine: "live",
  };
}

export function attachHomeFeedCompositionPolicyMeta<T extends { meta?: Record<string, unknown> }>(
  payload: T,
  compositionPolicy: StoresHomeCompositionPolicyMeta | null
): T {
  if (!compositionPolicy) return payload;
  return {
    ...payload,
    meta: {
      ...(payload.meta ?? {}),
      compositionPolicy,
      compositionEngine: "live" as const,
    },
  };
}
