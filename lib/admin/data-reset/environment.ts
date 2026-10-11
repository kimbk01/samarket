/**
 * Data Reset env gate — Production execute is opt-in + per-scope allowlist
 * (see production-enable-policy.ts). CUT H Pre-launch Reset production ban unchanged.
 */

import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";

export type DataResetEnvGate = {
  tier: "local" | "staging" | "production";
  previewAllowed: boolean;
  executeAllowed: boolean;
  reasons: string[];
};

function truthy(raw: string | undefined): boolean {
  const v = (raw ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveDataResetEnvGate(env: NodeJS.ProcessEnv = process.env): DataResetEnvGate {
  const merged: NodeJS.ProcessEnv = { ...env };
  // Allow DATA_RESET_ENABLED as alias for PRELAUNCH_RESET_ENABLED (non-prod)
  if (!merged.PRELAUNCH_RESET_ENABLED && merged.DATA_RESET_ENABLED) {
    merged.PRELAUNCH_RESET_ENABLED = merged.DATA_RESET_ENABLED;
  }
  if (!merged.PRELAUNCH_RESET_PRODUCTION_DRY_RUN && merged.DATA_RESET_PRODUCTION_PREVIEW) {
    merged.PRELAUNCH_RESET_PRODUCTION_DRY_RUN = merged.DATA_RESET_PRODUCTION_PREVIEW;
  }

  const base = resolvePrelaunchResetEnvGate(merged);
  const dbTarget = resolveDataResetDatabaseTarget(merged);

  if (base.tier === "production") {
    const reasons: string[] = [];
    const prodExecOptIn = truthy(merged.DATA_RESET_PRODUCTION_EXECUTE);
    if (!base.dryRunAllowed) {
      reasons.push("production_dry_run_requires_explicit_opt_in");
    }
    // P0 hard stop: a Production or unidentifiable database is never mutated by Data Reset,
    // regardless of DATA_RESET_PRODUCTION_EXECUTE. Re-enabling Production execute requires the
    // server-held approval flow (two-person + MFA), not an env var.
    if (dbTarget.target !== "non_production") {
      reasons.push("production_execute_forbidden");
      reasons.push(dbTarget.reason);
      if (prodExecOptIn) reasons.push("DATA_RESET_PRODUCTION_EXECUTE_ignored_by_database_guard");
    } else if (!prodExecOptIn) {
      reasons.push("production_execute_forbidden");
      reasons.push("DATA_RESET_PRODUCTION_EXECUTE_not_set");
    } else {
      reasons.push("production_execute_opt_in_scope_allowlist");
    }
    return {
      tier: "production",
      previewAllowed: base.dryRunAllowed,
      // Scope allowlist applied in planner finalize + execute VERIFY.
      executeAllowed: prodExecOptIn && dbTarget.target === "non_production",
      reasons,
    };
  }

  return {
    tier: base.tier,
    previewAllowed: base.dryRunAllowed,
    executeAllowed: base.executeAllowed,
    reasons: base.reasons,
  };
}
