/**
 * CUT H — environment fail-closed for Pre-launch Reset.
 */

import type { AppDeployTier } from "@/lib/config/deploy-surface";

function truthy(raw: string | undefined): boolean {
  const v = (raw ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

function deployTierFromEnv(env: NodeJS.ProcessEnv): AppDeployTier {
  const t = (env.NEXT_PUBLIC_APP_DEPLOY_TIER ?? "").trim().toLowerCase();
  if (t === "local" || t === "staging" || t === "production") return t;

  const vercel = (env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "staging";
  if (vercel === "development") return "local";

  if ((env.NODE_ENV ?? "").trim() !== "production") return "local";
  return "production";
}

export type PrelaunchResetEnvGate = {
  tier: "local" | "staging" | "production";
  dryRunAllowed: boolean;
  executeAllowed: boolean;
  reasons: string[];
};

/**
 * Production: execute always blocked.
 * Dry-run on Production: MASTER-only read analysis is allowed by default (no mutation),
 * but can be disabled with PRELAUNCH_RESET_PRODUCTION_DRY_RUN=0.
 *
 * Execute requires non-production + PRELAUNCH_RESET_ENABLED=1.
 */
export function resolvePrelaunchResetEnvGate(env: NodeJS.ProcessEnv = process.env): PrelaunchResetEnvGate {
  const tier = deployTierFromEnv(env);
  const reasons: string[] = [];
  const enabled = truthy(env.PRELAUNCH_RESET_ENABLED);

  if (tier === "production") {
    const prodDry =
      env.PRELAUNCH_RESET_PRODUCTION_DRY_RUN == null
        ? true
        : truthy(env.PRELAUNCH_RESET_PRODUCTION_DRY_RUN);
    if (!prodDry) reasons.push("production_dry_run_disabled");
    reasons.push("production_execute_forbidden");
    return {
      tier: "production",
      dryRunAllowed: prodDry,
      executeAllowed: false,
      reasons,
    };
  }

  if (!enabled) {
    reasons.push("PRELAUNCH_RESET_ENABLED_not_set");
    return {
      tier,
      dryRunAllowed: true,
      executeAllowed: false,
      reasons,
    };
  }

  return {
    tier,
    dryRunAllowed: true,
    executeAllowed: true,
    reasons: [],
  };
}
