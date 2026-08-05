#!/usr/bin/env node
/**
 * Slice 8-1 — Auth State Boundary Authority Contract (PLAN_B4 static guard).
 * Import/call-graph only — does not change product Runtime.
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
  const importRe =
    /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src)) != null) {
    specs.push(m[1]);
  }
  const requireRe = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = requireRe.exec(src)) != null) {
    specs.push(m[1]);
  }
  return specs;
}

function specsHitNeedle(spec, needle) {
  const normalized = spec.replace(/^@\//, "").replace(/\\/g, "/");
  return normalized.includes(needle) || spec.includes(needle);
}

function assertNoForbiddenImports(rel, needles, label) {
  const src = read(rel);
  const specs = collectImportSpecifiers(src);
  for (const needle of needles) {
    for (const spec of specs) {
      if (specsHitNeedle(spec, needle)) {
        failures.push(`${label}: ${rel} imports "${spec}" (forbidden: ${needle})`);
      }
    }
  }
}

function assertNoCall(rel, fnName, label) {
  const src = read(rel);
  const re = new RegExp(`\\b${fnName}\\s*\\(`);
  if (re.test(src)) {
    failures.push(`${label}: ${rel} must not call ${fnName}()`);
  }
}

const SSOT = "lib/auth/state/auth-state-boundary-contract.ts";
const TRACE = "lib/auth/oauth/auth-lifecycle-trace.ts";
const SESSION = "lib/auth/dibay-session-manager.ts";
const OAUTH_LOCK = "lib/auth/oauth/native-oauth-contract.ts";
const FINISH = "lib/auth/finish-client-auth-login.client.ts";
const RUN = "lib/auth/completion/run-common-auth-client-completion.client.ts";
const TYPES = "lib/auth/completion/types.ts";
const POLICY = "lib/auth/dibay-session-policy.ts";
const UI_FILES = [
  "app/login/LoginPageClient.tsx",
  "components/auth/AuthModal.tsx",
  "lib/auth/oauth/use-oauth-login.ts",
];

const TRACE_FORBIDDEN = [
  "dibay-session-manager",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "sync-common-client-session",
  "syncCommonClientSessionAfterAuth",
  "finish-client-auth-login",
  "run-common-auth-client-completion",
  "next/navigation",
  "next/router",
];

const SESSION_FORBIDDEN = [
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "finish-client-auth-login",
  "finishClientAuthLogin",
  "run-common-auth-client-completion",
  "runCommonAuthClientCompletion",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
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
  if (!ssot.includes("NO_MEGA_FSM") || !ssot.includes("AUTH_STATE_BOUNDARIES") || !ssot.includes("PLAN_B4")) {
    failures.push("SSOT must export NO_MEGA_FSM / AUTH_STATE_BOUNDARIES / PLAN_B4");
  }
  for (const layer of [
    "sessionLifecycle",
    "commonCompletion",
    "observability",
    "providerLocal",
    "uiPresentation",
  ]) {
    if (!ssot.includes(layer)) failures.push(`SSOT missing layer ${layer}`);
  }
}

{
  const trace = read(TRACE);
  if (!/instrumentation only|Does not change login control flow/i.test(trace)) {
    failures.push("auth-lifecycle-trace must remain Observability-only (header contract)");
  }
  assertNoForbiddenImports(TRACE, TRACE_FORBIDDEN, "trace-import");
  if (/setSessionPhase|ensureAuthProfileForLogin|resolveCommonAuthDestination/.test(trace)) {
    failures.push("trace must not reference session/profile/destination authority APIs");
  }
}

assertNoForbiddenImports(SESSION, SESSION_FORBIDDEN, "session-import");
assertNoCall(SESSION, "finishClientAuthLogin", "session-call");
assertNoCall(SESSION, "runCommonAuthClientCompletion", "session-call");
assertNoCall(SESSION, "resolveCommonAuthDestination", "session-call");

{
  const lock = read(OAUTH_LOCK);
  const specs = collectImportSpecifiers(lock);
  if (specs.some((s) => s.includes("dibay-session"))) {
    failures.push("oauth lock must not import dibay-session-manager");
  }
  if (/setSessionPhase|markSessionAuthenticated|markSessionTerminalGuest|DibaySessionPhase/.test(lock)) {
    failures.push("oauth lock must not mutate/own DibaySessionPhase");
  }
  if (!lock.includes("tryBeginOAuthFlow")) {
    failures.push("oauth lock must export tryBeginOAuthFlow");
  }
}

for (const rel of UI_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) continue;
  assertNoForbiddenImports(rel, ["dibay-session-manager"], "ui-import");
  assertNoCall(rel, "setSessionPhase", "ui-call");
  assertNoCall(rel, "markSessionAuthenticatedFromClient", "ui-call");
  assertNoCall(rel, "markSessionTerminalGuestFromClient", "ui-call");
}

assertNoCall(FINISH, "ensureSessionHealthy", "completion-restore");
assertNoCall(RUN, "ensureSessionHealthy", "completion-restore");
assertNoCall(FINISH, "bindDibaySessionManagerAuthListener", "completion-restore");
assertNoCall(RUN, "bindDibaySessionManagerAuthListener", "completion-restore");
assertNoCall(FINISH, "setSessionPhase", "completion-phase");
assertNoCall(RUN, "setSessionPhase", "completion-phase");
assertNoForbiddenImports(FINISH, ["dibay-session-manager"], "completion-import");
assertNoForbiddenImports(RUN, ["dibay-session-manager"], "completion-import");

{
  const types = read(TYPES);
  if (!types.includes('authPhase: "auth-lifecycle-trace"')) {
    failures.push("COMMON_AUTH_COMPLETION_OWNERS.authPhase must remain auth-lifecycle-trace");
  }
  if (!types.includes('destination: "resolveCommonAuthDestination"')) {
    failures.push("Slice 6 destination owner must remain resolveCommonAuthDestination");
  }
  if (!types.includes('navigation: "runCommonAuthClientCompletion"')) {
    failures.push("Slice 6 navigation owner must remain runCommonAuthClientCompletion");
  }
  if (!types.includes('profile: "ensureAuthProfileForLogin"')) {
    failures.push("Slice 6/7 profile owner must remain ensureAuthProfileForLogin");
  }
  if (!types.includes('clientSync: "syncCommonClientSessionAfterAuth"')) {
    failures.push("Slice 6 clientSync owner must remain syncCommonClientSessionAfterAuth");
  }
}

{
  const policy = read(POLICY);
  const trace = read(TRACE);
  for (const cls of QA_EXTERNAL) {
    if (policy.includes(cls)) failures.push(`session policy must not include QA class ${cls}`);
    if (trace.includes(cls)) failures.push(`lifecycle trace must not include QA class ${cls}`);
  }
  if (!policy.includes("terminal_guest")) {
    failures.push("session policy must keep terminal_guest for logout restore block");
  }
}

if (failures.length > 0) {
  console.error("verify:auth-state-boundary-contract FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:auth-state-boundary-contract PASS");
