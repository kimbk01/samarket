/**
 * CUT H / I-P0-11 — Pre-launch Reset executor.
 * Consumes the SAME buildPrelaunchResetPlan / revalidate path as dry-run.
 * Phases: DB → STORAGE → AUTH (not a cross-system transaction).
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

async function removeStorageObject(
  sb: SupabaseClient,
  bucket: string,
  path: string
): Promise<"deleted" | "missing" | "error"> {
  const { error } = await sb.storage.from(bucket).remove([path]);
  if (!error) return "deleted";
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("not found") || msg.includes("404") || msg.includes("does not exist")) {
    return "missing";
  }
  // Supabase often returns success even when object missing; treat generic failures as error
  return "error";
}

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

  // PHASE DB — only executable content/ads steps
  const dbDeleted: Record<string, number> = {};
  let dbFail = false;
  try {
    for (const step of plan.deleteSteps) {
      if (!step.executableInCutH || step.estimatedRows <= 0) continue;
      if (step.phase !== "DB") continue;
      if (step.table === "posts") {
        const ids = [...plan.selector.contentIds];
        if (ids.length) {
          const { error, count } = await input.sb
            .from("posts")
            .delete({ count: "exact" })
            .in("id", ids);
          if (error) throw new Error(error.message);
          dbDeleted.posts = (dbDeleted.posts ?? 0) + (count ?? 0);
        }
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
        if (
          plan.selector.storeIds.length &&
          (plan.preset === "TEST_ADS_DATA" || plan.preset === "TEST_STORE_DATA")
        ) {
          const { error, count } = await input.sb
            .from("delivery_ad_campaigns")
            .delete({ count: "exact" })
            .in("store_id", plan.selector.storeIds)
            .in("status", ["draft", "ended", "archived", "rejected"]);
          if (error) {
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

  // PHASE STORAGE — explicit planned objects only (idempotent missing → handled)
  let storageFail = false;
  if (!plan.storageObjects?.length) {
    phases.push({
      phase: "STORAGE",
      status: "SKIPPED",
      detail: "no_explicit_storage_objects_in_plan",
    });
  } else {
    const byBucket = new Map<string, string[]>();
    for (const obj of plan.storageObjects) {
      const list = byBucket.get(obj.bucket) ?? [];
      list.push(obj.path);
      byBucket.set(obj.bucket, list);
    }
    let deleted = 0;
    let missing = 0;
    const errors: string[] = [];
    for (const [bucket, paths] of byBucket) {
      // Deduplicate paths within bucket
      const uniq = [...new Set(paths)];
      const { data, error } = await input.sb.storage.from(bucket).remove(uniq);
      if (error) {
        // Fallback per-path for partial handling
        for (const path of uniq) {
          const r = await removeStorageObject(input.sb, bucket, path);
          if (r === "deleted") deleted += 1;
          else if (r === "missing") missing += 1;
          else errors.push(`${bucket}/${path}:${error.message}`);
        }
      } else {
        deleted += Array.isArray(data) ? data.length : uniq.length;
      }
    }
    if (errors.length) {
      storageFail = true;
      phases.push({
        phase: "STORAGE",
        status: "FAIL",
        detail: errors.slice(0, 8).join("; "),
        deletedCounts: { storage: deleted },
      });
    } else {
      phases.push({
        phase: "STORAGE",
        status: "PASS",
        detail: JSON.stringify({ deleted, missingHandled: missing, planned: plan.storageObjects.length }),
        deletedCounts: { storage: deleted },
      });
    }
  }

  // PHASE AUTH — only action=DELETE targets; protections already enforced in plan
  let authFail = false;
  const toDelete = (plan.authTargets ?? []).filter((t) => t.action === "DELETE");
  const preserved = (plan.authTargets ?? []).filter((t) => t.action !== "DELETE");
  if (toDelete.length === 0) {
    phases.push({
      phase: "AUTH",
      status: "SKIPPED",
      detail:
        preserved.length > 0
          ? `no_delete_targets;preserve_or_blocked=${preserved.length}`
          : "no_auth_targets",
    });
  } else {
    const deletedUsers: string[] = [];
    const errors: string[] = [];
    for (const target of toDelete) {
      if (target.userId === input.actorUserId) {
        errors.push(`${target.userId}:refused_current_admin`);
        continue;
      }
      const { error } = await input.sb.auth.admin.deleteUser(target.userId);
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("not found") || msg.includes("user not found")) {
          deletedUsers.push(target.userId); // idempotent handled
        } else {
          errors.push(`${target.userId}:${error.message}`);
        }
      } else {
        deletedUsers.push(target.userId);
      }
    }
    if (errors.length) {
      authFail = true;
      phases.push({
        phase: "AUTH",
        status: "FAIL",
        detail: errors.slice(0, 8).join("; "),
        deletedCounts: { members: deletedUsers.length },
      });
    } else {
      phases.push({
        phase: "AUTH",
        status: "PASS",
        detail: JSON.stringify({
          deleted: deletedUsers.length,
          preservedOrBlocked: preserved.length,
        }),
        deletedCounts: { members: deletedUsers.length },
      });
    }
  }

  const hasFail = dbFail || storageFail || authFail;
  const overall = hasFail
    ? "FAIL"
    : phases.some((p) => p.status === "BLOCKED" && p.phase === "VERIFY")
      ? "BLOCKED"
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
      storageObjectCount: plan.storageObjects?.length ?? 0,
      authDeleteCount: toDelete.length,
    },
    after_json: {
      overall,
      phases,
      dbDeleted,
      environment: plan.environment,
      atomicClaim: false,
    },
  });

  return {
    ok: overall === "PASS",
    plan,
    phases,
    overall,
  };
}
