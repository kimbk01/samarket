#!/usr/bin/env node
/**
 * Slice 8-3 — Session Lifecycle Ownership static guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function collectImportSpecifiers(src) {
  const specs = [];
  const re =
    /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) != null) specs.push(m[1]);
  return specs;
}

function specsHit(spec, needle) {
  return spec.replace(/^@\//, "").includes(needle) || spec.includes(needle);
}

const SSOT = "lib/auth/state/auth-session-lifecycle-ownership-contract.ts";
const MANAGER = "lib/auth/dibay-session-manager.ts";
const POLICY = "lib/auth/dibay-session-policy.ts";
const LOGOUT = "lib/auth/explicit-logout-flow.ts";
const WIPE = "lib/auth/client-session-wipe.ts";
const GUEST = "lib/auth/guest-auth-state.ts";
const BOUNDARY = "lib/auth/state/auth-state-boundary-contract.ts";
const TRACE_SSOT = "lib/auth/state/auth-lifecycle-trace-observability-contract.ts";
const TYPES = "lib/auth/completion/types.ts";

const COLD_RESUME = [
  "lib/app-boot/run-app-boot.ts",
  "lib/auth/dibay-session-manager.ts",
  "hooks/use-client-membership-state.ts",
  "components/auth/SessionLostRedirect.tsx",
  "components/auth/SupabaseAuthSync.tsx",
];

const PHASE_WRITE_FORBIDDEN = [
  "app/login/LoginPageClient.tsx",
  "components/auth/AuthModal.tsx",
  "lib/auth/oauth/use-oauth-login.ts",
  "lib/auth/oauth/auth-lifecycle-trace.ts",
  "lib/auth/oauth/native-oauth-contract.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
];

const MANAGER_FORBIDDEN = [
  "finish-client-auth-login",
  "finishClientAuthLogin",
  "run-common-auth-client-completion",
  "runCommonAuthClientCompletion",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "next/navigation",
  "next/router",
];

const QA_EXTERNAL = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
];

{
  const ssot = read(SSOT);
  if (!ssot.includes("AUTH_SESSION_LIFECYCLE_OWNER_MODULE") || !ssot.includes("dibay-session-manager")) {
    failures.push("Session lifecycle SSOT missing");
  }
  if (!read(BOUNDARY).includes("NO_MEGA_FSM")) failures.push("8-1 boundary SSOT must remain");
  if (!read(TRACE_SSOT).includes("PLAN_T1")) failures.push("8-2 trace SSOT must remain");
}

{
  const manager = read(MANAGER);
  if (!manager.includes("function setSessionPhase(")) {
    failures.push("setSessionPhase must remain private inside dibay-session-manager");
  }
  if (!manager.includes("shouldSkipEnsureHealthyForTerminalGuestGate")) {
    failures.push("terminal guest ensureHealthy gate missing");
  }
  const specs = collectImportSpecifiers(manager);
  for (const needle of MANAGER_FORBIDDEN) {
    for (const spec of specs) {
      if (specsHit(spec, needle)) failures.push(`session-manager imports ${spec} (${needle})`);
    }
  }
  if (/\brouter\.(push|replace)\s*\(/.test(manager)) {
    failures.push("session-manager must not call router.push/replace");
  }
}

// setSessionPhase definition only in manager (scan key auth surfaces)
{
  const scanRoots = ["lib/auth", "lib/app-boot", "app/login", "components/auth", "hooks"];
  for (const root of scanRoots) {
    const abs = path.join(ROOT, root);
    if (!fs.existsSync(abs)) continue;
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "__tests__" || ent.name === "node_modules") continue;
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(ent.name) || /\.test\.|\.spec\./.test(ent.name)) continue;
        const rel = path.relative(ROOT, p).replace(/\\/g, "/");
        const src = fs.readFileSync(p, "utf8");
        if (/function setSessionPhase\s*\(/.test(src) && rel !== MANAGER) {
          failures.push(`setSessionPhase redefined outside owner: ${rel}`);
        }
      }
    };
    walk(abs);
  }
}

for (const rel of COLD_RESUME) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    failures.push(`missing cold/resume surface ${rel}`);
    continue;
  }
  const src = read(rel);
  for (const fn of ["finishClientAuthLogin", "runCommonAuthClientCompletion", "resolveCommonAuthDestination"]) {
    if (new RegExp(`\\b${fn}\\s*\\(`).test(src)) {
      failures.push(`${rel} must not call ${fn}`);
    }
  }
}

for (const rel of PHASE_WRITE_FORBIDDEN) {
  if (!fs.existsSync(path.join(ROOT, rel))) continue;
  const src = read(rel);
  if (/setSessionPhase\s*\(/.test(src)) failures.push(`${rel} must not call setSessionPhase`);
  const specs = collectImportSpecifiers(src);
  if (specs.some((s) => s.includes("dibay-session-manager"))) {
    failures.push(`${rel} must not import dibay-session-manager`);
  }
}

{
  const logout = read(LOGOUT);
  if (!logout.includes("establishGuestAuthState") || !logout.includes("markSessionTerminalGuestFromClient")) {
    failures.push("explicit logout must set guest terminal + terminal_guest phase");
  }
  if (!logout.includes('wipeClientSessionState("user_logout")')) {
    failures.push("explicit logout must wipe user_logout");
  }
  const guest = read(GUEST);
  if (!/establishRecoverableGuestAuthState[\s\S]*?authMissing && !guestRecoverable/.test(guest)) {
    failures.push("terminal guest must block recoverable downgrade");
  }
  const wipe = read(WIPE);
  if (!wipe.includes("POST_LOGOUT_BFCACHE_GUARD_KEY") || !wipe.includes("account_switched")) {
    failures.push("wipe must keep post-logout guard + account_switched");
  }
}

{
  const policy = read(POLICY);
  for (const cls of QA_EXTERNAL) {
    if (policy.includes(cls)) failures.push(`DibaySessionPhase must not include ${cls}`);
  }
}

{
  const types = read(TYPES);
  if (!types.includes('destination: "resolveCommonAuthDestination"')) {
    failures.push("Slice 6 destination owner must remain");
  }
  if (!types.includes('navigation: "runCommonAuthClientCompletion"')) {
    failures.push("Slice 6 navigation owner must remain");
  }
  if (!types.includes('profile: "ensureAuthProfileForLogin"')) {
    failures.push("Slice 6/7 profile owner must remain");
  }
}

if (failures.length > 0) {
  console.error("verify:auth-session-lifecycle-ownership-contract FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:auth-session-lifecycle-ownership-contract PASS");
