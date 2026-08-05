#!/usr/bin/env node
/**
 * Slice 8-4 — Completion / Provider / UI Boundary static guard.
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

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function countCalls(src, fn) {
  const clean = stripComments(src);
  return (clean.match(new RegExp(`\\b${fn}\\s*\\(\\s*[{\`'"]`, "g")) || []).length;
}

function hasCall(src, fn) {
  return countCalls(src, fn) > 0 || new RegExp(`\\b${fn}\\s*\\(\\s*\\)`).test(stripComments(src));
}

const SSOT = "lib/auth/state/auth-completion-provider-ui-boundary-contract.ts";
const FINISH = "lib/auth/finish-client-auth-login.client.ts";
const RUN = "lib/auth/completion/run-common-auth-client-completion.client.ts";
const HANDOFF = "lib/auth/completion/build-native-auth-completion-handoff.client.ts";
const PROVIDERS = [
  "lib/auth/native/start-native-google-login.client.ts",
  "lib/auth/native/start-native-kakao-login.client.ts",
  "lib/auth/native/start-native-apple-login.client.ts",
];
const UI = ["app/login/LoginPageClient.tsx", "components/auth/AuthModal.tsx", "lib/auth/oauth/use-oauth-login.ts"];
const WEB_NAVER = ["app/auth/callback/route.ts", "app/api/auth/naver/callback/route.ts"];

const FORBIDDEN_CLIENT = [
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "sync-common-client-session",
  "syncCommonClientSessionAfterAuth",
  "run-common-auth-client-completion",
  "runCommonAuthClientCompletion",
  "dibay-session-manager",
];

{
  const ssot = read(SSOT);
  if (!ssot.includes("AUTH_THIN_HANDOFF_BUILDER") || !ssot.includes("buildNativeAuthCompletionHandoff")) {
    failures.push("8-4 SSOT missing Thin Handoff ownership");
  }
  if (!read("lib/auth/state/auth-state-boundary-contract.ts").includes("NO_MEGA_FSM")) {
    failures.push("8-1 boundary must remain");
  }
}

{
  const finish = read(FINISH);
  if (countCalls(finish, "runCommonAuthClientCompletion") !== 1) {
    failures.push("finishClientAuthLogin must call runCommonAuthClientCompletion exactly once");
  }
  const run = stripComments(read(RUN));
  if ((run.match(/bumpAuthLifecycleCounter\("navigation"\)/g) || []).length !== 1) {
    failures.push("runCommonAuthClientCompletion navigation bump must be exactly 1");
  }
  if (!run.includes("client_session_sync_failed") || !run.includes("empty_destination")) {
    failures.push("Completion failure reasons must remain (nav 0 paths)");
  }
  if (!read(HANDOFF).includes("syncFromNativeExchangeCookies: true")) {
    failures.push("Thin Handoff must set syncFromNativeExchangeCookies");
  }
}

for (const rel of PROVIDERS) {
  const src = read(rel);
  const clean = stripComments(src);
  if (!src.includes("buildNativeAuthCompletionHandoff")) {
    failures.push(`${rel} must use shared Thin Handoff`);
  }
  const specs = collectImportSpecifiers(src);
  for (const needle of FORBIDDEN_CLIENT) {
    if (needle.includes("runCommon") || needle.includes("run-common")) {
      if (hasCall(src, "runCommonAuthClientCompletion")) {
        failures.push(`${rel} must not call runCommonAuthClientCompletion`);
      }
      continue;
    }
    for (const spec of specs) {
      if (specsHit(spec, needle)) failures.push(`${rel} imports ${spec} (${needle})`);
    }
  }
  if (/\brouter\.(push|replace)\s*\(/.test(clean) || /location\.(assign|replace)\s*\(/.test(clean)) {
    failures.push(`${rel} must not perform success navigation`);
  }
}

{
  const google = read(PROVIDERS[0]);
  if (countCalls(google, "finishClientAuthLogin") !== 1) {
    failures.push("Google client finishClientAuthLogin must be recover-only (exactly 1 call site)");
  }
  const kakao = read(PROVIDERS[1]);
  const apple = read(PROVIDERS[2]);
  if (countCalls(kakao, "finishClientAuthLogin") !== 0) failures.push("Kakao must not call finish directly");
  if (countCalls(apple, "finishClientAuthLogin") !== 0) failures.push("Apple must not call finish directly");
}

for (const rel of ["app/login/LoginPageClient.tsx", "components/auth/AuthModal.tsx"]) {
  const src = read(rel);
  if (!/syncFromNativeExchangeCookies:\s*input\.syncFromNativeExchangeCookies\s*===\s*true/.test(src)) {
    failures.push(`${rel} must forward syncFromNativeExchangeCookies without drop`);
  }
  if (hasCall(src, "runCommonAuthClientCompletion")) {
    failures.push(`${rel} must not call runCommonAuthClientCompletion`);
  }
  const specs = collectImportSpecifiers(src);
  for (const needle of ["ensureAuthProfileForLogin", "resolveCommonAuthDestination", "syncCommonClientSessionAfterAuth", "dibay-session-manager"]) {
    for (const spec of specs) {
      if (specsHit(spec, needle)) failures.push(`${rel} imports ${spec}`);
    }
  }
}

{
  const oauth = read("lib/auth/oauth/use-oauth-login.ts");
  if (countCalls(oauth, "finishClientAuthLogin") !== 0 || hasCall(oauth, "runCommonAuthClientCompletion")) {
    failures.push("use-oauth-login must delegate success to onAuthSuccess only");
  }
}

for (const rel of WEB_NAVER) {
  const src = read(rel);
  if (!src.includes("NextResponse.redirect") || !src.includes("resolveCommonAuthDestination")) {
    failures.push(`${rel} must keep HTTP redirect + destination`);
  }
  if (hasCall(src, "runCommonAuthClientCompletion") || hasCall(src, "finishClientAuthLogin")) {
    failures.push(`${rel} must not use client Completion`);
  }
}

// Production runCommon callers outside tests: only finish
{
  const roots = ["lib/auth", "app", "components"];
  for (const root of roots) {
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
        if (rel === FINISH || rel === RUN) continue;
        const src = fs.readFileSync(p, "utf8");
        if (hasCall(src, "runCommonAuthClientCompletion")) {
          failures.push(`runCommonAuthClientCompletion caller outside finish: ${rel}`);
        }
      }
    };
    walk(abs);
  }
}

if (failures.length > 0) {
  console.error("verify:auth-completion-provider-ui-boundary-contract FAIL\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:auth-completion-provider-ui-boundary-contract PASS");
