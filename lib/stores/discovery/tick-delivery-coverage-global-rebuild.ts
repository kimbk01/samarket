import type { SupabaseClient } from "@supabase/supabase-js";
import { beginDeliveryCoverageGlobalRebuild } from "@/lib/stores/discovery/begin-delivery-coverage-global-rebuild";
import { runDeliveryCoverageGlobalRebuildBatch } from "@/lib/stores/discovery/run-delivery-coverage-global-rebuild-batch";
import { tryFlipDeliveryCoverageActiveVersion } from "@/lib/stores/discovery/try-flip-delivery-coverage-active-version";

export type CoverageGlobalRebuildTickResult = {
  status: "idle" | "building" | "flipped" | "failed";
  processedThisBatch: number;
  buildingPolicyVersion: number | null;
  activePolicyVersion: number;
};

export async function tickDeliveryCoverageGlobalRebuild(
  sb: SupabaseClient,
  batchSize = 100
): Promise<CoverageGlobalRebuildTickResult> {
  const { data: state } = await sb
    .from("delivery_coverage_policy_state")
    .select(
      "active_policy_version, building_policy_version, rebuild_status, rebuild_processed, rebuild_expected, rebuild_failed_count, rebuild_cursor_store_id"
    )
    .eq("id", 1)
    .maybeSingle();

  const active = Number(state?.active_policy_version ?? 1);
  const building = state?.building_policy_version != null ? Number(state.building_policy_version) : null;

  if (state?.rebuild_status !== "building" || building == null) {
    return {
      status: "idle",
      processedThisBatch: 0,
      buildingPolicyVersion: building,
      activePolicyVersion: active,
    };
  }

  if (Number(state.rebuild_failed_count) > 0) {
    const processed = Number(state.rebuild_processed ?? 0);
    const expected = Number(state.rebuild_expected ?? 0);
    if (processed >= expected && expected > 0) {
      return {
        status: "failed",
        processedThisBatch: 0,
        buildingPolicyVersion: building,
        activePolicyVersion: active,
      };
    }
  }

  const batch = await runDeliveryCoverageGlobalRebuildBatch(sb, {
    policyVersion: building,
    batchSize,
    cursorStoreId: (state.rebuild_cursor_store_id as string | null) ?? null,
  });

  if (batch.failed > 0) {
    const { data: afterFail } = await sb
      .from("delivery_coverage_policy_state")
      .select("rebuild_processed, rebuild_expected, rebuild_failed_count")
      .eq("id", 1)
      .maybeSingle();
    const processed = Number(afterFail?.rebuild_processed ?? 0);
    const expected = Number(afterFail?.rebuild_expected ?? 0);
    if (processed >= expected && expected > 0) {
      return {
        status: "failed",
        processedThisBatch: batch.processed,
        buildingPolicyVersion: building,
        activePolicyVersion: active,
      };
    }
  }

  const { data: after } = await sb
    .from("delivery_coverage_policy_state")
    .select("rebuild_processed, rebuild_expected")
    .eq("id", 1)
    .maybeSingle();

  const processed = Number(after?.rebuild_processed ?? 0);
  const expected = Number(after?.rebuild_expected ?? 0);

  if (processed >= expected && expected > 0) {
    const flip = await tryFlipDeliveryCoverageActiveVersion(sb);
    if (flip.flipped) {
      return {
        status: "flipped",
        processedThisBatch: batch.processed,
        buildingPolicyVersion: flip.activePolicyVersion,
        activePolicyVersion: flip.activePolicyVersion,
      };
    }
  }

  return {
    status: "building",
    processedThisBatch: batch.processed,
    buildingPolicyVersion: building,
    activePolicyVersion: active,
  };
}

export { beginDeliveryCoverageGlobalRebuild };
