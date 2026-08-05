#!/usr/bin/env node
/**
 * Slice 8-2 — Trace Observability-Only static import/caller guard (PLAN_T1).
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
  while ((m = importRe.exec(src)) != null) specs.push(m[1]);
  return specs;
}

function specsHit(spec, needle) {
  return spec.replace(/^@\//, "").includes(needle) || spec.includes(needle);
}

const TRACE = "lib/auth/oauth/auth-lifecycle-trace.ts";
const SSOT = "lib/auth/state/auth-lifecycle-trace-observability-contract.ts";
const BOUNDARY = "lib/auth/state/auth-state-boundary-contract.ts";
const TYPES = "lib/auth/completion/types.ts";

const CALLERS = [
  "lib/auth/oauth/use-oauth-login.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
  "lib/auth/native/post-native-exchange.client.ts",
  "lib/auth/native/start-native-apple-login.client.ts",
  "lib/auth/native/sync-client-session-after-native-exchange.client.ts",
  "lib/auth/oauth/native-oauth-return-bridge.ts",
];

const FORBIDDEN_IMPORTS = [
  "dibay-session-manager",
  "dibay-session-policy",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "sync-common-client-session",
  "syncCommonClientSessionAfterAuth",
  "finish-client-auth-login",
  "run-common-auth-client-completion",
  "explicit-logout-flow",
  "client-session-wipe",
  "logout-client",
  "next/navigation",
  "next/router",
  "persistGoogleProfileIdentity",
  "persistOAuthProviderIdentity",
];

const QA_EXTERNAL = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
];

const STAGES = [
  "login_button_tapped",
  "routing_decision_completed",
  "provider_launch_requested",
  "provider_ui_presented",
  "provider_credential_received",
  "exchange_requested",
  "server_session_established",
  "cookie_handoff_completed",
  "client_session_visible",
  "profile_resolved",
  "onboarding_resolved",
  "navigation_committed",
  "interaction_ready",
];

{
  const ssot = read(SSOT);
  if (!ssot.includes("PLAN_T1") || !ssot.includes("AUTH_TRACE_FORBIDDEN_IMPORT_NEEDLES")) {
    failures.push("Trace observability SSOT missing PLAN_T1 / forbidden imports");
  }
  const boundary = read(BOUNDARY);
  if (!boundary.includes("NO_MEGA_FSM") || !boundary.includes("observability")) {
    failures.push("Slice 8-1 boundary SSOT must remain");
  }
}

{
  const trace = read(TRACE);
  if (!/Observability-only|instrumentation only/i.test(trace)) {
    failures.push("Trace module must declare Observability-only");
  }
  if (!trace.includes("emitAuthLifecycleLog") && !/try\s*\{[\s\S]*logOAuthNativeEvent/.test(trace)) {
    failures.push("Trace sink calls must be failure-isolated (try/catch)");
  }
  if (!trace.includes("SENSITIVE_KEY") || !trace.includes("redactAuthLifecycleDetail")) {
    failures.push("Trace must keep sensitive redaction");
  }
  for (const stage of STAGES) {
    if (!trace.includes(`"${stage}"`)) failures.push(`PLAN_T1 stage renamed/missing: ${stage}`);
  }
  for (const cls of QA_EXTERNAL) {
    if (trace.includes(cls)) failures.push(`Trace must not include QA class ${cls}`);
  }
  if (/setSessionPhase|ensureAuthProfileForLogin|resolveCommonAuthDestination|router\./.test(trace)) {
    failures.push("Trace must not reference session/profile/destination/router authority");
  }

  const specs = collectImportSpecifiers(trace);
  for (const needle of FORBIDDEN_IMPORTS) {
    for (const spec of specs) {
      if (specsHit(spec, needle)) {
        failures.push(`Trace imports forbidden "${spec}" (${needle})`);
      }
    }
  }
}

const BRANCH_PATTERNS = [
  [/\bif\s*\([^)]*getActiveAuthFlowId\s*\(/, "if(getActiveAuthFlowId)"],
  [/\bif\s*\([^)]*beginAuthLifecycleFlow\s*\(/, "if(beginAuthLifecycleFlow)"],
  [/await\s+markAuthLifecycleStage\s*\(/, "await markAuthLifecycleStage"],
  [/await\s+completeAuthLifecycle\s*\(/, "await completeAuthLifecycle"],
  [/return\s+markAuthLifecycleStage\s*\(/, "return markAuthLifecycleStage"],
  [/return\s+completeAuthLifecycle\s*\(/, "return completeAuthLifecycle"],
  [/return\s+failAuthLifecycle\s*\(/, "return failAuthLifecycle"],
];

for (const rel of CALLERS) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    failures.push(`missing caller ${rel}`);
    continue;
  }
  const src = read(rel);
  for (const [re, label] of BRANCH_PATTERNS) {
    if (re.test(src)) failures.push(`${rel}: Trace-driven branch ${label}`);
  }
}

{
  const oauth = read("lib/auth/oauth/use-oauth-login.ts");
  if (/const\s+\w+\s*=\s*beginAuthLifecycleFlow\s*\(/.test(oauth)) {
    failures.push("use-oauth-login must not consume beginAuthLifecycleFlow return for product policy");
  }
}

{
  const run = read("lib/auth/completion/run-common-auth-client-completion.client.ts");
  const count = (run.match(/bumpAuthLifecycleCounter\("navigation"\)/g) || []).length;
  if (count !== 1) {
    failures.push(`runCommonAuthClientCompletion navigation counter bump must be exactly 1 (got ${count})`);
  }
}

{
  const types = read(TYPES);
  if (!types.includes('authPhase: "auth-lifecycle-trace"')) {
    failures.push("COMMON_AUTH_COMPLETION_OWNERS.authPhase must remain auth-lifecycle-trace");
  }
  if (!types.includes('profile: "ensureAuthProfileForLogin"')) {
    failures.push("Slice 6/7 profile owner must remain");
  }
  if (!types.includes('navigation: "runCommonAuthClientCompletion"')) {
    failures.push("Slice 6 navigation owner must remain");
  }
}

if (failures.length > 0) {
  console.error("verify:auth-lifecycle-trace-observability-contract FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:auth-lifecycle-trace-observability-contract PASS");
