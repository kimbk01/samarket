#!/usr/bin/env node
/**
 * Verify Vercel Custom Environment `test` SUPABASE_SERVICE_ROLE_KEY JWT ref
 * matches TEST project without printing secrets.
 *
 * Usage (linked project):
 *   node scripts/verify-test-service-role-ref.mjs
 *
 * Optional: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env
 * (never log those values).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED = "tcwnueuzuxftyomttdyu";
const PROD = "ckdosyydvgzqwpbwuhon";
const tmp = resolve(process.cwd(), `.env.vercel.test.verify.${process.pid}`);

function jwtRef(token) {
  if (!token || token.split(".").length < 2) return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).ref ?? null;
  } catch {
    return null;
  }
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

let env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  const pull = spawnSync(
    "vercel",
    ["env", "pull", tmp, "--environment=test", "--yes"],
    { encoding: "utf8" }
  );
  if (pull.status !== 0) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "BLOCKED",
        reason: "vercel_env_pull_failed",
        detail: (pull.stderr || pull.stdout || "").slice(0, 200),
      })
    );
    process.exit(2);
  }
  if (existsSync(tmp)) {
    env = { ...env, ...parseEnvFile(readFileSync(tmp, "utf8")) };
    unlinkSync(tmp);
  }
}

const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
let urlRef = null;
try {
  urlRef = new URL(url).hostname.split(".")[0] || null;
} catch {
  urlRef = null;
}
const svcRaw = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const redacted =
  svcRaw === "[SENSITIVE]" ||
  svcRaw === "[ENCRYPTED]" ||
  /^\[.+\]$/.test(svcRaw);
const serviceRef = jwtRef(env.SUPABASE_SERVICE_ROLE_KEY);
const anonRef = jwtRef(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let status = "FAIL";
if (!svcRaw) status = "NOT_PROVEN";
else if (redacted && urlRef === EXPECTED && anonRef === EXPECTED)
  status = "NOT_PROVEN"; // Vercel pull redacts Sensitive — use runtime probe
else if (
  urlRef === EXPECTED &&
  serviceRef === EXPECTED &&
  anonRef === EXPECTED &&
  serviceRef !== PROD
)
  status = "PASS";
else if (serviceRef === PROD || urlRef === PROD) status = "FAIL";

const result = {
  ok: status === "PASS",
  status,
  urlRef,
  anonRefClaim: anonRef,
  serviceRoleRefClaim: serviceRef,
  serviceRolePresent: Boolean(svcRaw),
  serviceRolePullRedacted: redacted,
  expected: EXPECTED,
  note:
    status === "NOT_PROVEN" && redacted
      ? "Sensitive value redacted on pull; confirm via /api/runtime/test-isolation-probe after TEST deploy"
      : undefined,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : result.status === "NOT_PROVEN" ? 2 : 1);
