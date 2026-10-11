/**
 * P0 — Data Reset database-target guard (fail-closed).
 *
 * Deploy tier env vars (NEXT_PUBLIC_APP_DEPLOY_TIER / VERCEL_ENV / NODE_ENV) say where the
 * code runs, not which database it mutates. A Preview deployment wired to the Production
 * Supabase project resolves to tier "staging", which previously opened execute with
 * PRELAUNCH_RESET_ENABLED / DATA_RESET_ENABLED alone.
 *
 * This guard reads the Supabase URL the service client actually uses
 * (NEXT_PUBLIC_SUPABASE_URL, same dynamic read as lib/env/runtime.ts) and classifies it:
 *   - production      → known Production project ref. Destructive reset is NEVER allowed.
 *   - non_production  → loopback (local Supabase stack) or a *.supabase.co ref that is
 *                       not a Production ref.
 *   - unknown         → missing / unparsable / custom domain. Treated as Production (fail-closed).
 *
 * Production refs are hard-coded. DATA_RESET_PRODUCTION_SUPABASE_REFS can only ADD refs;
 * no env var can remove a hard-coded ref.
 */

/** Hard-coded Production Supabase project refs (cannot be removed by env). */
export const DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS: readonly string[] = ["ckdosyydvgzqwpbwuhon"];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type DataResetDatabaseTarget = {
  target: "production" | "non_production" | "unknown";
  projectRef: string | null;
  reason: string;
};

function readUrl(env: NodeJS.ProcessEnv): string | null {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL;
  const v = typeof raw === "string" ? raw.trim() : "";
  return v ? v : null;
}

function productionRefs(env: NodeJS.ProcessEnv): Set<string> {
  const refs = new Set<string>(DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS.map((r) => r.toLowerCase()));
  const extra = (env.DATA_RESET_PRODUCTION_SUPABASE_REFS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const r of extra) refs.add(r);
  return refs;
}

export function resolveDataResetDatabaseTarget(
  env: NodeJS.ProcessEnv = process.env
): DataResetDatabaseTarget {
  const url = readUrl(env);
  if (!url) {
    return { target: "unknown", projectRef: null, reason: "database_target_url_missing" };
  }

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { target: "unknown", projectRef: null, reason: "database_target_url_unparsable" };
  }

  if (LOOPBACK_HOSTS.has(host)) {
    return { target: "non_production", projectRef: null, reason: "database_target_loopback" };
  }

  const m = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(host);
  if (!m) {
    return { target: "unknown", projectRef: null, reason: "database_target_unrecognized_host" };
  }
  const ref = m[1];
  if (productionRefs(env).has(ref)) {
    return { target: "production", projectRef: ref, reason: "database_target_production" };
  }
  return { target: "non_production", projectRef: ref, reason: "database_target_non_production" };
}

/** True only when the database is positively identified as non-Production. */
export function isDataResetDestructiveTargetAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveDataResetDatabaseTarget(env).target === "non_production";
}
