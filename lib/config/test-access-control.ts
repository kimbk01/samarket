/**
 * P1 — TEST access control (allowlist).
 *
 * Bootstrap: env allowlist until TEST DB table is provisioned.
 * DIBAY_TEST_ALLOWED_USER_IDS=uuid,uuid
 * DIBAY_TEST_ALLOWED_EMAILS=a@b.com,c@d.com (lowercase match)
 *
 * Active when runtime surface is TEST (isolated non-prod DB) or
 * NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE=test.
 */

import {
  evaluateSideEffectDispatchGate,
  resolveServerDeployTier,
} from "@/lib/config/test-production-isolation";

export type TestAccessDecision = {
  required: boolean;
  allowed: boolean;
  reason: string;
};

function parseCsv(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const v = part.trim().toLowerCase();
    if (v) set.add(v);
  }
  return set;
}

/** True when this deployment is operating as DIBAY TEST (not Production). */
export function isTestRuntimeSurface(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = (env.NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE ?? "").trim().toLowerCase();
  if (explicit === "test") return true;
  if (explicit === "production") return false;

  // Vercel Custom Environment name (VERCEL_ENV stays "preview"; TARGET_ENV = "test").
  const target = (env.VERCEL_TARGET_ENV ?? "").trim().toLowerCase();
  if (target === "test") return true;

  const gate = evaluateSideEffectDispatchGate(env);
  return gate.allowed && gate.reason === "isolated_non_production_database";
}

/**
 * Preview/local wired to Production DB — mutations must fail closed
 * (complement to cron/push P0 gate).
 */
export function isMiswiredNonProductionOnProductionDb(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const tier = resolveServerDeployTier(env);
  if (tier === "production") return false;
  const gate = evaluateSideEffectDispatchGate(env);
  return (
    gate.reason === "non_production_deploy_production_database" ||
    gate.reason === "non_production_deploy_unknown_database"
  );
}

export function evaluateTestAccess(input: {
  userId?: string | null;
  email?: string | null;
  env?: NodeJS.ProcessEnv;
}): TestAccessDecision {
  const env = input.env ?? process.env;
  if (!isTestRuntimeSurface(env)) {
    return { required: false, allowed: true, reason: "not_test_surface" };
  }

  const ids = parseCsv(env.DIBAY_TEST_ALLOWED_USER_IDS);
  const emails = parseCsv(env.DIBAY_TEST_ALLOWED_EMAILS);

  if (ids.size === 0 && emails.size === 0) {
    return {
      required: true,
      allowed: false,
      reason: "test_allowlist_empty",
    };
  }

  const uid = (input.userId ?? "").trim().toLowerCase();
  const email = (input.email ?? "").trim().toLowerCase();
  if (uid && ids.has(uid)) {
    return { required: true, allowed: true, reason: "allowlist_user_id" };
  }
  if (email && emails.has(email)) {
    return { required: true, allowed: true, reason: "allowlist_email" };
  }
  return { required: true, allowed: false, reason: "not_on_test_allowlist" };
}
