/**
 * executeDomainReset — same planner as preview; hash-bound; Production execute forbidden.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import { executeDerivedStateReset } from "@/lib/admin/data-reset/derived-state";
import {
  buildDomainResetPlan,
  confirmationMatchesPlan,
  revalidateDomainResetPlan,
} from "@/lib/admin/data-reset/planner";
import {
  DATA_RESET_FORBIDDEN_OPS,
  issueDataResetOneTimeToken,
  verifyDataResetOneTimeToken,
  type DataResetExecuteResult,
  type DataResetPhaseResult,
  type DataResetRequest,
} from "@/lib/admin/data-reset/types";
import { POST_IMAGES_BUCKET } from "@/lib/media/post-images-storage-ownership";
import { storageTargetsHashIdentity } from "@/lib/admin/data-reset/resolve-storage-objects-for-reset";

export type ExecuteDomainResetInput = {
  sb: SupabaseClient;
  actorUserId: string;
  request: Omit<DataResetRequest, "mode">;
  planId: string;
  expectedHash: string;
  typedConfirmation: string;
  oneTimeToken?: string;
};

/** Delete only hash-bound owned Storage paths. No bucket list / prefix purge. */
async function runStorageActions(
  sb: SupabaseClient,
  plan: Awaited<ReturnType<typeof buildDomainResetPlan>>
): Promise<{ removed: number; errors: string[]; detail: string }> {
  const owned = plan.storageTargets.filter((t) => t.cleanupPolicy === "DELETE");
  if (!owned.length) {
    return {
      removed: 0,
      errors: [],
      detail: plan.domain === "chat" ? "chat_storage_preserve" : "no_owned_storage_targets",
    };
  }

  // Re-bind: only identities present on this plan (preview hash already verified).
  const bound = storageTargetsHashIdentity(owned);
  const byBucket = new Map<string, string[]>();
  for (const t of bound) {
    if (t.bucket !== POST_IMAGES_BUCKET) {
      // Refuse unknown buckets — no expansion beyond ownership SSOT.
      continue;
    }
    const list = byBucket.get(t.bucket) ?? [];
    list.push(t.path);
    byBucket.set(t.bucket, list);
  }

  let removed = 0;
  const errors: string[] = [];
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await sb.storage.from(bucket).remove(chunk);
      if (error) errors.push(`${bucket}:${error.message}`);
      else removed += chunk.length;
    }
  }

  return {
    removed,
    errors,
    detail: `owned_post_images_removed_${removed}_of_${bound.length}`,
  };
}

async function runDbActions(
  sb: SupabaseClient,
  actorUserId: string,
  plan: Awaited<ReturnType<typeof buildDomainResetPlan>>
): Promise<{ counts: Record<string, number>; errors: string[] }> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  for (const step of plan.delete) {
    if (step.table === "community_posts" && plan.domain === "community" && plan.scope === "single" && plan.entityId) {
      const { error, count } = await sb
        .from("community_posts")
        .delete({ count: "exact" })
        .eq("id", plan.entityId);
      if (error) errors.push(error.message);
      else counts.community_posts = (counts.community_posts ?? 0) + (count ?? 0);
      continue;
    }
    if (step.table === "community_posts" && plan.scope === "all") {
      // Safety: require HIGH confirm already; delete all via filter that matches any uuid
      const { data, error } = await sb.from("community_posts").select("id").limit(5000);
      if (error) {
        errors.push(error.message);
        continue;
      }
      const ids = (data ?? []).map((r) => String((r as { id: string }).id));
      if (ids.length) {
        const { error: dErr, count } = await sb
          .from("community_posts")
          .delete({ count: "exact" })
          .in("id", ids);
        if (dErr) errors.push(dErr.message);
        else counts.community_posts = (counts.community_posts ?? 0) + (count ?? 0);
      }
      continue;
    }
    if (step.table === "posts" && plan.domain === "market" && plan.scope === "single" && plan.entityId) {
      const { error, count } = await sb.from("posts").delete({ count: "exact" }).eq("id", plan.entityId);
      if (error) errors.push(error.message);
      else counts.posts = (counts.posts ?? 0) + (count ?? 0);
      continue;
    }
    if (step.table === "posts" && (plan.domain === "market" || plan.domain === "full") && plan.scope === "all") {
      const { data, error } = await sb.from("posts").select("id").limit(5000);
      if (error) {
        errors.push(error.message);
        continue;
      }
      const ids = (data ?? []).map((r) => String((r as { id: string }).id));
      if (ids.length) {
        const { error: dErr, count } = await sb.from("posts").delete({ count: "exact" }).in("id", ids);
        if (dErr) errors.push(dErr.message);
        else counts.posts = (counts.posts ?? 0) + (count ?? 0);
      }
      continue;
    }
    if (step.table === "posts" && plan.domain === "member" && plan.entityId) {
      const { error, count } = await sb
        .from("posts")
        .delete({ count: "exact" })
        .eq("user_id", plan.entityId);
      if (error) errors.push(error.message);
      else counts.posts = (counts.posts ?? 0) + (count ?? 0);
      continue;
    }
    if (step.table === "community_posts" && plan.domain === "member" && plan.entityId) {
      const { error, count } = await sb
        .from("community_posts")
        .delete({ count: "exact" })
        .eq("user_id", plan.entityId);
      if (error) errors.push(error.message);
      else counts.community_posts = (counts.community_posts ?? 0) + (count ?? 0);
      continue;
    }
    if (step.table === "store_products") {
      if (plan.scope === "single" && plan.subtype === "product" && plan.entityId) {
        const { error, count } = await sb
          .from("store_products")
          .delete({ count: "exact" })
          .eq("id", plan.entityId);
        if (error) errors.push(error.message);
        else counts.store_products = (counts.store_products ?? 0) + (count ?? 0);
      } else if (plan.scope === "single" && plan.entityId) {
        const { error, count } = await sb
          .from("store_products")
          .delete({ count: "exact" })
          .eq("store_id", plan.entityId);
        if (error) errors.push(error.message);
        else counts.store_products = (counts.store_products ?? 0) + (count ?? 0);
      } else {
        const { data, error } = await sb.from("store_products").select("id").limit(5000);
        if (error) {
          errors.push(error.message);
          continue;
        }
        const ids = (data ?? []).map((r) => String((r as { id: string }).id));
        if (ids.length) {
          const { error: dErr, count } = await sb
            .from("store_products")
            .delete({ count: "exact" })
            .in("id", ids);
          if (dErr) errors.push(dErr.message);
          else counts.store_products = (counts.store_products ?? 0) + (count ?? 0);
        }
      }
      continue;
    }
    if (step.table === "user_social_relations") {
      if (plan.scope === "user" && plan.entityId) {
        const { error, count } = await sb
          .from("user_social_relations")
          .delete({ count: "exact" })
          .or(`owner_user_id.eq.${plan.entityId},target_user_id.eq.${plan.entityId}`);
        if (error) errors.push(error.message);
        else counts.user_social_relations = (counts.user_social_relations ?? 0) + (count ?? 0);
      } else if (plan.domain === "member" && plan.entityId) {
        const { error, count } = await sb
          .from("user_social_relations")
          .delete({ count: "exact" })
          .or(`owner_user_id.eq.${plan.entityId},target_user_id.eq.${plan.entityId}`);
        if (error) errors.push(error.message);
        else counts.user_social_relations = (counts.user_social_relations ?? 0) + (count ?? 0);
      } else {
        const { data, error } = await sb.from("user_social_relations").select("id").limit(5000);
        if (error) {
          errors.push(error.message);
          continue;
        }
        const ids = (data ?? []).map((r) => String((r as { id: string }).id));
        if (ids.length) {
          const { error: dErr, count } = await sb
            .from("user_social_relations")
            .delete({ count: "exact" })
            .in("id", ids);
          if (dErr) errors.push(dErr.message);
          else counts.user_social_relations = (counts.user_social_relations ?? 0) + (count ?? 0);
        }
      }
      continue;
    }
  }

  for (const step of plan.softDelete) {
    if (step.table !== "community_messenger_rooms") continue;
    const now = new Date().toISOString();
    if (plan.scope === "single" && plan.entityId) {
      const { error, count } = await sb
        .from("community_messenger_rooms")
        .update({ deleted_at: now, deleted_by: actorUserId }, { count: "exact" })
        .eq("id", plan.entityId)
        .is("deleted_at", null);
      if (error) errors.push(error.message);
      else counts.community_messenger_rooms_soft =
        (counts.community_messenger_rooms_soft ?? 0) + (count ?? 0);
      continue;
    }
    const domains =
      plan.scope === "type" && plan.subtype
        ? [plan.subtype]
        : ["general_direct", "group"];
    for (const d of domains) {
      const { data, error } = await sb
        .from("community_messenger_rooms")
        .select("id")
        .eq("chat_domain", d)
        .is("deleted_at", null)
        .limit(5000);
      if (error) {
        errors.push(error.message);
        continue;
      }
      const ids = (data ?? []).map((r) => String((r as { id: string }).id));
      if (!ids.length) continue;
      const { error: uErr, count } = await sb
        .from("community_messenger_rooms")
        .update({ deleted_at: now, deleted_by: actorUserId }, { count: "exact" })
        .in("id", ids)
        .is("deleted_at", null);
      if (uErr) errors.push(uErr.message);
      else
        counts.community_messenger_rooms_soft =
          (counts.community_messenger_rooms_soft ?? 0) + (count ?? 0);
    }
  }

  // DETACH: no-op on room rows (B4) — listing/order already SET NULL on delete elsewhere
  void plan.detach;

  return { counts, errors };
}

export async function executeDomainReset(
  input: ExecuteDomainResetInput
): Promise<DataResetExecuteResult> {
  const phases: DataResetPhaseResult[] = [];
  const env = resolveDataResetEnvGate();

  if (!env.executeAllowed) {
    const plan = await buildDomainResetPlan({
      sb: input.sb,
      actorUserId: input.actorUserId,
      request: input.request,
      planId: input.planId,
    });
    phases.push({
      phase: "VERIFY",
      status: "BLOCKED",
      detail: env.reasons.join(",") || "execute_forbidden",
    });
    return {
      ok: false,
      overall: "BLOCKED",
      plan,
      phases,
      executedCounts: {},
      clientSessionInvalidationRequired: false,
    };
  }

  // Never call wipe SQL
  void DATA_RESET_FORBIDDEN_OPS;

  const reval = await revalidateDomainResetPlan({
    sb: input.sb,
    actorUserId: input.actorUserId,
    request: input.request,
    planId: input.planId,
    expectedHash: input.expectedHash,
  });
  if (!reval.ok) {
    phases.push({ phase: "VERIFY", status: "BLOCKED", detail: reval.reason });
    return {
      ok: false,
      overall: "BLOCKED",
      plan: reval.plan,
      phases,
      executedCounts: {},
      clientSessionInvalidationRequired: false,
    };
  }

  const plan = reval.plan;
  if (plan.blockers.length || !plan.executeAllowed) {
    phases.push({
      phase: "VERIFY",
      status: "BLOCKED",
      detail: plan.blockedReason || plan.blockers.join(",") || "plan_not_executable",
    });
    return {
      ok: false,
      overall: "BLOCKED",
      plan,
      phases,
      executedCounts: {},
      clientSessionInvalidationRequired: false,
    };
  }

  if (!confirmationMatchesPlan(plan, input.typedConfirmation)) {
    phases.push({ phase: "VERIFY", status: "BLOCKED", detail: "typed_confirmation_mismatch" });
    return {
      ok: false,
      overall: "BLOCKED",
      plan,
      phases,
      executedCounts: {},
      clientSessionInvalidationRequired: false,
    };
  }

  if (plan.confirmationLevel >= 3) {
    const tok = String(input.oneTimeToken ?? "");
    if (
      !verifyDataResetOneTimeToken(tok, {
        planId: plan.planId,
        planHash: plan.planHash,
        actorUserId: input.actorUserId,
      })
    ) {
      phases.push({ phase: "VERIFY", status: "BLOCKED", detail: "one_time_token_invalid" });
      return {
        ok: false,
        overall: "BLOCKED",
        plan,
        phases,
        executedCounts: {},
        clientSessionInvalidationRequired: false,
      };
    }
  }

  phases.push({ phase: "VERIFY", status: "PASS", detail: "hash_confirm_ok" });

  const startedAt = new Date().toISOString();
  const { counts, errors } = await runDbActions(input.sb, input.actorUserId, plan);
  if (errors.length) {
    phases.push({
      phase: "DB",
      status: errors.length && Object.keys(counts).length ? "PARTIAL" : "FAIL",
      detail: errors.join(" | "),
      counts,
    });
  } else {
    phases.push({ phase: "DB", status: "PASS", detail: "db_actions_ok", counts });
  }

  // Derived server state — after DB, before Storage (client namespaces returned for browser).
  const derived = await executeDerivedStateReset({
    sb: input.sb,
    targets: plan.derivedStateTargets,
  });
  const derivedStatus: DataResetPhaseResult["status"] = derived.errors.length
    ? Object.keys(derived.counts).length
      ? "PARTIAL"
      : "FAIL"
    : "PASS";
  phases.push({
    phase: "DERIVED",
    status: derivedStatus,
    detail: derived.detail + (derived.errors.length ? ` | ${derived.errors.join(" | ")}` : ""),
    counts: derived.counts,
  });

  // Storage: only plan.storageTargets with cleanupPolicy=DELETE (hash-bound). Never bucket-wide.
  let storageErrors = 0;
  let storageRemoved = 0;
  if (plan.storageTargets.some((t) => t.cleanupPolicy === "DELETE")) {
    const storage = await runStorageActions(input.sb, plan);
    storageErrors = storage.errors.length;
    storageRemoved = storage.removed;
    phases.push({
      phase: "STORAGE",
      status: storage.errors.length
        ? storage.removed
          ? "PARTIAL"
          : "FAIL"
        : "PASS",
      detail: storage.detail + (storage.errors.length ? ` | ${storage.errors.join(" | ")}` : ""),
      counts: { storage_removed: storage.removed },
    });
    if (storage.errors.length && !errors.length && !storage.removed) {
      // keep overall based on DB + derived + storage
    }
  } else if (plan.storage.length) {
    phases.push({
      phase: "STORAGE",
      status: "SKIPPED",
      detail:
        plan.domain === "chat"
          ? "chat_attachments_preserve_b4"
          : "no_owned_storage_targets_or_preserve_only",
    });
  } else {
    phases.push({ phase: "STORAGE", status: "SKIPPED", detail: "no_storage_steps" });
  }

  const dbSuccessCounts = Object.keys(counts).length;
  const derivedHadErrors = derived.errors.length > 0;
  let overall: DataResetExecuteResult["overall"];
  if (derivedHadErrors && dbSuccessCounts === 0 && errors.length > 0) {
    overall = "FAILED";
  } else if (derivedHadErrors && dbSuccessCounts === 0 && errors.length === 0) {
    // DB reported ok/noop but derived failed — treat as FAIL when no DB success counts
    overall = "FAILED";
  } else if (errors.length === 0 && !derivedHadErrors && storageErrors === 0) {
    overall = "SUCCESS";
  } else if (errors.length > 0 && dbSuccessCounts === 0 && !derivedHadErrors && storageRemoved === 0) {
    overall = "FAILED";
  } else {
    // DB ok/partial but derived errors → PARTIAL; or mixed DB/storage
    overall = "PARTIAL";
  }

  await appendAuditLog(input.sb, {
    actor_type: "admin",
    actor_id: input.actorUserId,
    target_type: "data_reset",
    target_id: plan.planId,
    action: `data_reset_execute_${plan.domain}_${plan.scope}`,
    before_json: {
      planHash: plan.planHash,
      preview_counts: plan.estimatedCounts,
      riskLevel: plan.riskLevel,
      startedAt,
    },
    after_json: {
      overall,
      executedCounts: counts,
      derivedCounts: derived.counts,
      errors: [...errors, ...derived.errors],
      completedAt: new Date().toISOString(),
      clientSessionInvalidationRequired: true,
      clientInvalidation: plan.clientInvalidation,
    },
  });
  phases.push({ phase: "AUDIT", status: "PASS", detail: "audit_logs_appended" });

  return {
    ok: overall === "SUCCESS",
    overall,
    plan,
    phases,
    executedCounts: { ...counts, ...derived.counts },
    clientSessionInvalidationRequired: true,
    clientInvalidation: plan.clientInvalidation,
  };
}

export function previewOneTimeTokenForPlan(
  planId: string,
  planHash: string,
  actorUserId: string
): string {
  return issueDataResetOneTimeToken({ planId, planHash, actorUserId });
}
