/**
 * Test-only Production write guard (fail-closed) — vitest DB writers + Playwright mutation specs.
 *
 * C-48: a service-role vitest E2E wrote to the Production Supabase project after loading `.env.local`.
 * Classification is by the ACTUAL target URL host (project ref), never by env var NAME
 * (`STAGING_*`, `TEST_*` … can hold a Production URL). Single source for the ref list and host parsing:
 * `lib/admin/data-reset/database-target-guard.ts` (`DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS` hard-coded,
 * env may only ADD refs). Production / unknown / missing → throw. No env var or flag disables it.
 *
 * Node QA scripts (`scripts/**`) use the stricter `scripts/lib/db-target-guard.mjs` (`assertQaWriteTarget`).
 */
import fs from "node:fs";
import path from "node:path";
import {
  resolveDataResetDatabaseTarget,
  type DataResetDatabaseTarget,
} from "@/lib/admin/data-reset/database-target-guard";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";

export type NonProductionDbTargetOptions = {
  /** Require a loopback (local Supabase / Postgres stack) target, not just any non-Production ref. */
  loopbackOnly?: boolean;
  /** Prefix for the error message (which test / which source). */
  label?: string;
};

function classify(url: string | null | undefined): DataResetDatabaseTarget {
  return resolveDataResetDatabaseTarget({
    NEXT_PUBLIC_SUPABASE_URL: typeof url === "string" ? url : "",
    DATA_RESET_PRODUCTION_SUPABASE_REFS: process.env.DATA_RESET_PRODUCTION_SUPABASE_REFS,
  } as NodeJS.ProcessEnv);
}

/**
 * Throws unless `url` is positively a non-Production database endpoint
 * (loopback, or a `<ref>.supabase.co` whose ref is not a Production ref).
 * Call after env is loaded and before creating any client that writes.
 */
export function assertNonProductionDbTarget(
  url: string | null | undefined,
  opts: NonProductionDbTargetOptions = {}
): DataResetDatabaseTarget {
  const label = opts.label ?? "test DB write";
  const res = classify(url);
  if (res.target !== "non_production") {
    throw new Error(
      `[non-production-db-guard] REFUSING ${label}: ${res.reason}` +
        (res.projectRef ? ` (project ref ${res.projectRef})` : "")
    );
  }
  if (opts.loopbackOnly && res.reason !== "database_target_loopback") {
    throw new Error(
      `[non-production-db-guard] REFUSING ${label}: loopback database required, got ${res.reason}` +
        (res.projectRef ? ` (project ref ${res.projectRef})` : "")
    );
  }
  return res;
}

/** Every NEXT_PUBLIC_SUPABASE_URL a local Next server could load (process env + Next env files). */
const NEXT_ENV_FILES = [
  ".env.development.local",
  ".env.production.local",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env",
] as const;

function readEnvFileValue(file: string, key: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    if (t.slice(0, eq).replace(/^export\s+/, "").trim() !== key) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

export function collectLocalAppSupabaseUrls(
  cwd: string = process.cwd()
): Array<{ source: string; url: string }> {
  const out: Array<{ source: string; url: string }> = [];
  const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (fromEnv) out.push({ source: "process.env", url: fromEnv });
  for (const rel of NEXT_ENV_FILES) {
    const v = readEnvFileValue(path.join(cwd, rel), "NEXT_PUBLIC_SUPABASE_URL")?.trim();
    if (v) out.push({ source: rel, url: v });
  }
  return out;
}

/**
 * Playwright specs that MUTATE through the app (create/update/delete, send, apply, admin actions).
 * The app under test writes to whatever DB it is wired to, so:
 *   - Production app host (`DIBAY_PRODUCTION_SITE_ORIGIN`) → refuse.
 *   - Any other non-loopback host (Preview etc.) → refuse: its database cannot be verified (fail-closed).
 *   - Loopback app → every NEXT_PUBLIC_SUPABASE_URL the local server could load must be non-Production.
 */
export function assertPlaywrightMutationTargetNonProduction(
  baseUrl: string = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  cwd: string = process.cwd()
): void {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`[non-production-db-guard] REFUSING mutation spec: unparsable PLAYWRIGHT_BASE_URL ${baseUrl}`);
  }
  if (host === new URL(DIBAY_PRODUCTION_SITE_ORIGIN).hostname.toLowerCase()) {
    throw new Error(`[non-production-db-guard] REFUSING mutation spec against the Production app host ${host}`);
  }
  if (classify(baseUrl).reason !== "database_target_loopback") {
    throw new Error(
      `[non-production-db-guard] REFUSING mutation spec: app host ${host} is not loopback — its database cannot be verified`
    );
  }
  const urls = collectLocalAppSupabaseUrls(cwd);
  if (urls.length === 0) {
    throw new Error("[non-production-db-guard] REFUSING mutation spec: local app NEXT_PUBLIC_SUPABASE_URL missing");
  }
  for (const { source, url } of urls) {
    assertNonProductionDbTarget(url, { label: `mutation spec (local app ${source})` });
  }
}
