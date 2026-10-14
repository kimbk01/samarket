/**
 * DIBAY TEST / PRODUCTION isolation SSOT (P0+).
 *
 * Owner policy:
 * - Dual backend + DIBAY TEST app exist for optional isolation work (preserve; not required for every ship)
 * - Regular web ship: main → Vercel Production (Git Integration). TEST/Preview are not mandatory gates.
 * - No production member data clone into TEST
 * - TEST app id com.dibay.app.test / name "DIBAY TEST"
 * - Optional admin Promote-from-TEST stays fail-closed until Owner unlock (separate from regular main push)
 *
 * Deploy tier alone is NOT database isolation. Preview + Production Supabase
 * must fail closed for side effects (push / cron mutations).
 */

import {
  DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS,
  resolveDataResetDatabaseTarget,
  type DataResetDatabaseTarget,
} from "@/lib/admin/data-reset/database-target-guard";
import { getPublicDeployTier, type AppDeployTier } from "@/lib/config/deploy-surface";

/** Production native identity (do not change without separate Owner approval). */
export const DIBAY_PRODUCTION_APP_ID = "com.dibay.app" as const;
export const DIBAY_PRODUCTION_APP_NAME = "DIBAY" as const;

/** TEST native identity (P2 build target). */
export const DIBAY_TEST_APP_ID = "com.dibay.app.test" as const;
export const DIBAY_TEST_APP_NAME = "DIBAY TEST" as const;

export const DIBAY_TEST_DEEP_LINK_SCHEME = "dibay-test" as const;
export const DIBAY_PRODUCTION_DEEP_LINK_SCHEME = "dibay" as const;

/** Re-export Production refs (includes `ckdosyydvgzqwpbwuhon`). */
export { DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS };

export type SideEffectDispatchDecision = {
  allowed: boolean;
  reason: string;
  deployTier: AppDeployTier;
  database: DataResetDatabaseTarget;
};

/**
 * Server-preferring tier: VERCEL_ENV is authoritative on Vercel when public tier unset.
 * Does not invent a new "test" tier yet — TEST hosting uses staging/local + non-prod DB.
 */
export function resolveServerDeployTier(env: NodeJS.ProcessEnv = process.env): AppDeployTier {
  const explicit = (env.NEXT_PUBLIC_APP_DEPLOY_TIER ?? "").trim().toLowerCase();
  if (explicit === "local" || explicit === "staging" || explicit === "production") {
    return explicit;
  }

  const vercel = (env.VERCEL_ENV ?? env.NEXT_PUBLIC_VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "staging";
  if (vercel === "development") return "local";

  return getPublicDeployTier();
}

function isVitestRunner(env: NodeJS.ProcessEnv): boolean {
  return env.VITEST === "true" || env.NODE_ENV === "test";
}

/**
 * Gate for push dispatch and cron side effects that can reach real users.
 *
 * ALLOW:
 * - production deploy + production/unknown DB (live Production)
 * - any non-production deploy + positively non-production DB (TEST / local Supabase)
 * - vitest without an explicit Production DB URL (preserve unit tests)
 *
 * DENY:
 * - non-production deploy + Production Supabase ref (Preview/local leak)
 * - non-production deploy + unknown DB (fail-closed)
 * - production deploy + non-production DB (miswired Production)
 */
export function evaluateSideEffectDispatchGate(
  env: NodeJS.ProcessEnv = process.env
): SideEffectDispatchDecision {
  const deployTier = resolveServerDeployTier(env);
  const database = resolveDataResetDatabaseTarget(env);

  if (deployTier === "production") {
    if (database.target === "non_production") {
      return {
        allowed: false,
        reason: "production_deploy_non_production_database",
        deployTier,
        database,
      };
    }
    return {
      allowed: true,
      reason: "production_deploy",
      deployTier,
      database,
    };
  }

  if (database.target === "non_production") {
    return {
      allowed: true,
      reason: "isolated_non_production_database",
      deployTier,
      database,
    };
  }

  if (database.target === "production") {
    return {
      allowed: false,
      reason: "non_production_deploy_production_database",
      deployTier,
      database,
    };
  }

  if (isVitestRunner(env)) {
    return {
      allowed: true,
      reason: "vitest_runner_without_explicit_production_database",
      deployTier,
      database,
    };
  }

  return {
    allowed: false,
    reason: "non_production_deploy_unknown_database",
    deployTier,
    database,
  };
}

export function isSideEffectDispatchAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return evaluateSideEffectDispatchGate(env).allowed;
}

/** True when NEXT_PUBLIC_SUPABASE_URL is a known Production project ref. */
export function isWiredToProductionDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveDataResetDatabaseTarget(env).target === "production";
}
