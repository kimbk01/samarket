#!/usr/bin/env node
/**
 * DIBAY duplicate-login policy — 코드 기본값·OAuth rotate·(선택) live DB 검증.
 *
 * 사용:
 *   npm run verify:dibay-duplicate-login-policy
 *   DIBAY_VERIFY_ENV=local|staging|prod npm run verify:dibay-duplicate-login-policy
 *
 * DB 검증: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local 자동 로드)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_VERSION = "20260913190000";
const MIGRATION_FILE = `supabase/migrations/${MIGRATION_VERSION}_dibay_multi_device_session_policy.sql`;
const POLICY_COMPARE_COLS = [
  "compare_same_login_id",
  "compare_same_device",
  "compare_same_browser",
  "compare_same_ip",
];

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function inferEnvLabel(url) {
  const explicit = process.env.DIBAY_VERIFY_ENV?.trim();
  if (explicit) return explicit;
  const u = String(url ?? "").toLowerCase();
  if (u.includes("localhost") || u.includes("127.0.0.1")) return "local";
  if (u.includes("staging") || u.includes("stg")) return "staging";
  return "prod";
}

function staticChecks() {
  const failures = [];

  const sessionPolicy = fs.readFileSync("lib/auth/session-policy.ts", "utf8");
  for (const col of POLICY_COMPARE_COLS) {
    const re = new RegExp(`${col}:\\s*false`);
    if (!re.test(sessionPolicy)) {
      failures.push(`DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY.${col} is not false in session-policy.ts`);
    }
  }

  if (!fs.existsSync(MIGRATION_FILE)) {
    failures.push(`migration file missing: ${MIGRATION_FILE}`);
  } else {
    const mig = fs.readFileSync(MIGRATION_FILE, "utf8");
    for (const col of POLICY_COMPARE_COLS) {
      if (!mig.includes(`${col} = false`)) {
        failures.push(`migration ${MIGRATION_FILE} does not set ${col} = false`);
      }
    }
  }

  for (const oauthFile of ["app/auth/callback/route.ts", "app/api/auth/naver/callback/route.ts"]) {
    const src = fs.readFileSync(oauthFile, "utf8");
    if (/rotate:\s*true/.test(src)) {
      failures.push(`${oauthFile} still uses rotate: true (same-device session reuse violated)`);
    }
  }

  return failures;
}

async function dbChecks(url, serviceKey) {
  const envLabel = inferEnvLabel(url);
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("auth_duplicate_login_policy")
    .select("id, compare_same_login_id, compare_same_device, compare_same_browser, compare_same_ip")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    const msg = error.message ?? String(error);
    if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      return {
        envLabel,
        applied: null,
        reason: `DB unreachable (${envLabel}) — network error; verify manually with service role`,
      };
    }
    if (msg.includes("does not exist") || msg.includes("42P01") || msg.includes("schema cache")) {
      return {
        envLabel,
        applied: false,
        reason: `auth_duplicate_login_policy table missing — DB 미적용 (${envLabel})`,
      };
    }
    return { envLabel, applied: false, reason: `DB query failed (${envLabel}): ${msg}` };
  }

  if (!data) {
    return {
      envLabel,
      applied: false,
      reason: `default policy row missing — DB 미적용 (${envLabel})`,
    };
  }

  const badCols = POLICY_COMPARE_COLS.filter((col) => data[col] !== false);
  if (badCols.length > 0) {
    return {
      envLabel,
      applied: false,
      reason: `policy not fully disabled (${envLabel}): ${badCols.join(", ")} still true`,
      row: data,
    };
  }

  return { envLabel, applied: true, row: data };
}

async function main() {
  loadEnvLocal();

  console.log("\n=== DIBAY duplicate-login policy verify ===\n");

  const staticFailures = staticChecks();
  if (staticFailures.length > 0) {
    for (const f of staticFailures) console.error("FAIL (static):", f);
    process.exit(1);
  }
  console.log("PASS (static): code defaults + migration SQL + OAuth rotate:false");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    console.log("\nWARN: DB 미적용 — credentials missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    console.log("      Set env and re-run with DIBAY_VERIFY_ENV=local|staging|prod to verify live DB.");
  } else {
    const db = await dbChecks(url, serviceKey);
    console.log(`\nDB target (${db.envLabel}):`, url.replace(/\/\/[^@]+@/, "//***@"));
    if (db.applied === null) {
      console.log("WARN:", db.reason);
      console.log("      DB 미적용 — live check skipped (credentials OK but query failed).");
    } else if (!db.applied) {
      console.error("FAIL:", db.reason);
      process.exit(1);
    } else {
      console.log("PASS (DB): auth_duplicate_login_policy default row — all compare_* = false");
      console.log("         migration expected:", MIGRATION_VERSION);
    }
  }

  const tests = [
    "lib/auth/__tests__/dibay-session-manager.test.ts",
    "lib/auth/__tests__/dibay-session-manager-auth-events.test.ts",
    "lib/auth/__tests__/dibay-auth-refresh-race.test.ts",
    "lib/auth/__tests__/supabase-get-user-cache-policy.test.ts",
    "lib/profile/__tests__/fetch-me-profile-401-recovery.test.ts",
  ];

  const r = spawnSync("npx", ["vitest", "run", ...tests], {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });

  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }

  console.log("\nverify:dibay-duplicate-login-policy OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
