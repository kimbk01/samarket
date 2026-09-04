/**
 * CUT H — Pre-launch Reset executor.
 * Consumes the SAME buildPrelaunchResetPlan / revalidate path as dry-run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  buildPrelaunchResetPlan,
  confirmationMatches,
  revalidatePrelaunchResetPlan,
} from "@/lib/admin/prelaunch-reset/planner";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import type {
  PrelaunchResetPhaseResult,
  PrelaunchResetPlan,
  PrelaunchResetPreset,
  PrelaunchResetSelector,
} from "@/lib/admin/prelaunch-reset/types";

export type ExecutePrelaunchResetInput = {
  sb: SupabaseClient;
  actorUserId: string;
  preset: PrelaunchResetPreset;
  selector: Partial<PrelaunchResetSelector>;
  planId: string;
  expectedHash: string;
  typedConfirmation: string;
};

export type ExecutePrelaunchResetResult = {
  ok: boolean;
  plan: PrelaunchResetPlan;
  phases: PrelaunchResetPhaseResult[];
  overall: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED";
};

export async function executePrelaunchReset(
  input: ExecutePrelaunchResetInput
): Promise<ExecutePrelaunchResetResult> {
  const phases: PrelaunchResetPhaseResult[] = [];
  const envGate = resolvePrelaunchResetEnvGate();

  if (!envGate.executeAllowed) {
    const plan = await buildPrelaunchResetPlan({
      sb: input.sb,
      actorUserId: input.actorUserId,
      preset: input.preset,
      selector: input.selector,
      planId: input.planId,
    });
    phases.push({
      phase: "VERIFY",
      status: "BLOCKED",
      detail: envGate.reasons.join(",") || "execute_forbidden",
    });
    return { ok: false, plan, phases, overall: "BLOCKED" };
  }

  const reval = await revalidatePrelaunchResetPlan({
    sb: input.sb,
    actorUserId: input.actorUserId,
    preset: input.preset,
    selector: input.selector,
    planId: input.planId,
    expectedHash: input.expectedHash,
  });

  if (!reval.ok) {
    phases.push({
      phase: "VERIFY",
      status: "BLOCKED",
      detail: reval.reason === "stale" ? "plan_stale_rerun_dry_run" : "plan_blocked",
    });
    return { ok: false, plan: reval.plan, phases, overall: "BLOCKED" };
  }

  const plan = reval.plan;
  if (!confirmationMatches(plan, input.typedConfirmation)) {
    phases.push({
      phase: "VERIFY",
      status: "BLOCKED",
      detail: "typed_confirmation_mismatch",
    });
    return { ok: false, plan, phases, overall: "BLOCKED" };
  }

  // PHASE DB — only executableInCutH steps
  const dbDeleted: Record<string, number> = {};
  let dbFail = false;
  try {
    for (const step of plan.deleteSteps) {
      if (!step.executableInCutH || step.estimatedRows <= 0) continue;
      if (step.table === "posts") {
        const ids = [
          ...plan.selector.contentIds,
        ];
        // Delete by explicit content ids
        if (ids.length) {
          const { error, count } = await input.sb
            .from("posts")
            .delete({ count: "exact" })
            .in("id", ids);
          if (error) throw new Error(error.message);
          dbDeleted.posts = (dbDeleted.posts ?? 0) + (count ?? 0);
        }
        // Delete by author for content presets
        if (plan.selector.memberIds.length && plan.preset !== "TEST_ADS_DATA") {
          const { error, count } = await input.sb
            .from("posts")
            .delete({ count: "exact" })
            .in("user_id", plan.selector.memberIds);
          if (error) throw new Error(error.message);
          dbDeleted.posts = (dbDeleted.posts ?? 0) + (count ?? 0);
        }
      }
      if (step.table === "delivery_ad_campaigns") {
        if (plan.selector.deliveryAdCampaignIds.length) {
          const { error, count } = await input.sb
            .from("delivery_ad_campaigns")
            .delete({ count: "exact" })
            .in("id", plan.selector.deliveryAdCampaignIds);
          if (error) throw new Error(error.message);
          dbDeleted.delivery_ad_campaigns = (dbDeleted.delivery_ad_campaigns ?? 0) + (count ?? 0);
        }
        if (plan.selector.storeIds.length && (plan.preset === "TEST_ADS_DATA" || plan.preset === "TEST_STORE_DATA")) {
          // Conservative: only draft/ended campaigns if status column exists — best-effort filter
          const { error, count } = await input.sb
            .from("delivery_ad_campaigns")
            .delete({ count: "exact" })
            .in("store_id", plan.selector.storeIds)
            .in("status", ["draft", "ended", "archived", "rejected"]);
          if (error) {
            // fallback: refuse broaden — record fail for this step only if status filter unsupported
            throw new Error(error.message);
          }
          dbDeleted.delivery_ad_campaigns =
            (dbDeleted.delivery_ad_campaigns ?? 0) + (count ?? 0);
        }
      }
    }
    phases.push({
      phase: "DB",
      status: "PASS",
      detail: JSON.stringify(dbDeleted),
      deletedCounts: {
        content: dbDeleted.posts ?? 0,
        ads: dbDeleted.delivery_ad_campaigns ?? 0,
      },
    });
  } catch (e) {
    dbFail = true;
    phases.push({
      phase: "DB",
      status: "FAIL",
      detail: e instanceof Error ? e.message : "db_phase_failed",
    });
  }

  phases.push({
    phase: "STORAGE",
    status: "NOT_IMPLEMENTED",
    detail: "entity_prefix_cleanup_deferred_cut_h",
  });
  phases.push({
    phase: "AUTH",
    status: "FORBIDDEN",
    detail: "auth_user_delete_not_in_cut_h",
  });

  const overall = dbFail
    ? "FAIL"
    : phases.some((p) => p.status === "NOT_IMPLEMENTED" || p.status === "FORBIDDEN")
      ? "PARTIAL"
      : "PASS";

  await appendAuditLog(input.sb, {
    actor_type: "admin",
    actor_id: input.actorUserId,
    target_type: "prelaunch_reset",
    target_id: plan.planId,
    action: "prelaunch_reset_execute",
    before_json: {
      planHash: plan.planHash,
      counts: plan.counts,
      blockers: plan.blockers,
    },
    after_json: {
      overall,
      phases,
      dbDeleted,
      environment: plan.environment,
    },
  });

  // Never claim full success when storage/auth incomplete
  return {
    ok: overall === "PASS" || overall === "PARTIAL",
    plan,
    phases,
    overall,
  };
}
