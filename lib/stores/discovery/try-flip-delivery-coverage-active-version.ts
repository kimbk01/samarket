import type { SupabaseClient } from "@supabase/supabase-js";

export type FlipActiveVersionResult = {
  flipped: boolean;
  activePolicyVersion: number;
  previousPolicyVersion: number | null;
};

export async function tryFlipDeliveryCoverageActiveVersion(
  sb: SupabaseClient
): Promise<FlipActiveVersionResult> {
  const { data, error } = await sb.rpc("try_flip_delivery_coverage_active_version");
  if (error) {
    console.error("[tryFlipDeliveryCoverageActiveVersion]", error.message);
    const active = await sb
      .from("delivery_coverage_policy_state")
      .select("active_policy_version")
      .eq("id", 1)
      .maybeSingle();
    return {
      flipped: false,
      activePolicyVersion: Number(active.data?.active_policy_version ?? 1),
      previousPolicyVersion: null,
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const rec = (row ?? {}) as Record<string, unknown>;
  return {
    flipped: rec.flipped === true,
    activePolicyVersion: Number(rec.active_policy_version ?? 1),
    previousPolicyVersion:
      rec.previous_policy_version == null ? null : Number(rec.previous_policy_version),
  };
}
