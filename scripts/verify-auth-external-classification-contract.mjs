#!/usr/bin/env node
/**
 * Slice 8-5 — External / QA Classification static guard.
 * Ensures QA tokens never enter product Auth Runtime enums/modules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const QA = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_REACHED",
  "NOT_OBSERVED",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
  "RUNTIME_NOT_RUN",
  "DEPLOY_REQUIRED",
];

const SSOT = "lib/auth/state/auth-external-classification-contract.ts";
const TRACE = "lib/auth/oauth/auth-lifecycle-trace.ts";
const POLICY = "lib/auth/dibay-session-policy.ts";
const TYPES = "lib/auth/completion/types.ts";
const OAUTH = "lib/auth/oauth/use-oauth-login.ts";

const FORBIDDEN_PRODUCT = [
  TRACE,
  POLICY,
  "lib/auth/dibay-session-manager.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
  TYPES,
  "lib/auth/completion/ensure-auth-profile-for-login.server.ts",
  "lib/auth/completion/resolve-common-auth-destination.server.ts",
  "lib/auth/completion/sync-common-client-session.client.ts",
  "lib/auth/completion/build-native-auth-completion-handoff.client.ts",
];

{
  const ssot = read(SSOT);
  if (!ssot.includes("AUTH_QA_EXTERNAL_CLASSIFICATIONS") || !ssot.includes("AUTH_QA_CLASSIFICATION_MAPPING")) {
    failures.push("8-5 SSOT missing QA classification map");
  }
  if (!ssot.includes("NOT_OBSERVED") || !ssot.includes("EXTERNAL_AUTH_CHALLENGE_BLOCKED")) {
    failures.push("8-5 SSOT must list core QA classifications");
  }
  if (!read("lib/auth/state/auth-state-boundary-contract.ts").includes("NO_MEGA_FSM")) {
    failures.push("8-1 boundary must remain");
  }
}

{
  const trace = read(TRACE);
  if (!/AuthLifecycleResult\s*=\s*"ok"\s*\|\s*"fail"\s*\|\s*"cancel"\s*\|\s*"in_progress"/.test(trace)) {
    failures.push("AuthLifecycleResult must remain product-only ok|fail|cancel|in_progress");
  }
  for (const cls of QA) {
    if (trace.includes(cls)) failures.push(`Trace product module must not contain ${cls}`);
  }
}

{
  const policy = read(POLICY);
  for (const phase of ["loading", "authenticated", "recovering", "terminal_guest", "corrupt"]) {
    if (!policy.includes(`"${phase}"`)) failures.push(`DibaySessionPhase missing ${phase}`);
  }
  for (const cls of QA) {
    if (policy.includes(cls)) failures.push(`Session policy must not contain ${cls}`);
  }
}

{
  const types = read(TYPES);
  for (const cls of QA) {
    if (types.includes(cls)) failures.push(`Completion types must not contain ${cls}`);
  }
}

for (const rel of FORBIDDEN_PRODUCT) {
  const src = read(rel);
  for (const cls of QA) {
    if (src.includes(cls)) failures.push(`${rel} must not contain QA token ${cls}`);
  }
}

{
  const oauth = read(OAUTH);
  if (!/cancelAuthLifecycle\(\{\s*reason:\s*"user_cancelled"\s*\}\)/.test(oauth)) {
    failures.push("user_cancelled must call cancelAuthLifecycle");
  }
  const idxCancel = oauth.indexOf('reason: "user_cancelled"');
  const window = oauth.slice(Math.max(0, idxCancel - 200), idxCancel + 80);
  if (window.includes("failAuthLifecycle") && window.includes("user_cancelled")) {
    // ensure fail is not in the cancel arm — cancelAuthLifecycle should be present
    if (!window.includes("cancelAuthLifecycle")) {
      failures.push("user_cancelled branch must use cancelAuthLifecycle");
    }
  }
}

// Scan lib/auth production (exclude tests + state contracts) for QA tokens
{
  const authRoot = path.join(ROOT, "lib/auth");
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "__tests__" || ent.name === "node_modules") continue;
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(ent.name)) continue;
      if (/\.test\.|\.spec\./.test(ent.name)) continue;
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      if (rel.startsWith("lib/auth/state/") && rel.includes("contract")) continue;
      const src = fs.readFileSync(p, "utf8");
      for (const cls of QA) {
        if (src.includes(cls)) {
          failures.push(`Production auth module contains QA token ${cls}: ${rel}`);
        }
      }
    }
  };
  walk(authRoot);
}

if (failures.length > 0) {
  console.error("verify:auth-external-classification-contract FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:auth-external-classification-contract PASS");
