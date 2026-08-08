/**
 * Read authority for Manner Battery — member_trust_snapshots first.
 * Bridge: profiles.trust_score only when snapshot missing (migration window).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { MANNER_SCORE_NEUTRAL } from "@/lib/trust/manner-battery-policy-v1";
import { clampMannerPercent } from "@/lib/trust/manner-battery-calculator";
import { resolveTrustScoreAuthority } from "@/lib/trust/trust-score-ssot";

export type MemberTrustRead = {
  manner_battery_percent: number;
  policy_version: string | null;
  source: "member_trust_snapshots" | "profiles.trust_score_bridge" | "neutral_default";
};

export async function readMemberMannerBattery(
  sb: SupabaseClient<any>,
  memberId: string
): Promise<MemberTrustRead> {
  const { data: snap } = await sb
    .from("member_trust_snapshots")
    .select("manner_battery_percent, policy_version")
    .eq("member_id", memberId)
    .maybeSingle();

  if (snap && (snap as { manner_battery_percent?: number }).manner_battery_percent != null) {
    const p = Number((snap as { manner_battery_percent: number }).manner_battery_percent);
    return {
      manner_battery_percent: clampMannerPercent(p),
      policy_version: String((snap as { policy_version?: string }).policy_version ?? ""),
      source: "member_trust_snapshots",
    };
  }

  const { data: prof } = await sb
    .from("profiles")
    .select("trust_score, manner_score")
    .eq("id", memberId)
    .maybeSingle();

  if (prof) {
    const authority = resolveTrustScoreAuthority({
      trust_score: (prof as { trust_score?: number | null }).trust_score,
      manner_score: (prof as { manner_score?: number | null }).manner_score,
    });
    return {
      manner_battery_percent: authority,
      policy_version: null,
      source: "profiles.trust_score_bridge",
    };
  }

  return {
    manner_battery_percent: MANNER_SCORE_NEUTRAL,
    policy_version: null,
    source: "neutral_default",
  };
}
