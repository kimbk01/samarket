import type { SupabaseClient } from "@supabase/supabase-js";

export type BeginGlobalRebuildResult = {
  activePolicyVersion: number;
  buildingPolicyVersion: number;
  rebuildExpected: number;
};

export async function beginDeliveryCoverageGlobalRebuild(
  sb: SupabaseClient
): Promise<BeginGlobalRebuildResult | null> {
  const { data, error } = await sb.rpc("begin_delivery_coverage_global_rebuild");
  if (error) {
    console.error("[beginDeliveryCoverageGlobalRebuild]", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  return {
    activePolicyVersion: Number(rec.active_policy_version) || 1,
    buildingPolicyVersion: Number(rec.building_policy_version) || 1,
    rebuildExpected: Number(rec.rebuild_expected) || 0,
  };
}
