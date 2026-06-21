#!/usr/bin/env node
/**
 * DIBAY call lifecycle SSOT static contract.
 * @see docs/community-messenger/call-lifecycle-ssot.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function mustInclude(relPath, needle, message) {
  const src = read(relPath);
  if (!src.includes(needle)) failures.push(message ?? `${relPath} must include ${needle}`);
}

function mustNotInclude(relPath, needle, message) {
  const src = read(relPath);
  if (src.includes(needle)) failures.push(message ?? `${relPath} must not include ${needle}`);
}

function mustNotMatch(relPath, regex, message) {
  const src = read(relPath);
  if (regex.test(src)) failures.push(message ?? `${relPath} matched ${regex}`);
}

mustInclude("docs/community-messenger/call-lifecycle-ssot.md", "DIBAY Call Lifecycle SSOT");
mustInclude(".cursor/rules/cm-call-lifecycle-contract.mdc", "DIBAY Call Lifecycle SSOT");

const callClient = "components/community-messenger/CommunityMessengerCallClient.tsx";
mustNotInclude(callClient, "patchCommunityMessengerCallSession", "CallClient must not own call-session PATCH");
mustNotInclude(callClient, 'method: "PATCH"', "CallClient must not issue direct PATCH fetches");
mustNotInclude(callClient, "call_client_unmount_caller_preconnect");
mustNotInclude(callClient, "tmpToRealHandoff");
mustNotInclude(callClient, "ensureOutgoingTempCallBootstrap");
mustNotInclude(callClient, "markOutgoingTempCallBootstrapCancelled");
mustInclude(callClient, "runCallEndGuard");
mustInclude(callClient, "acceptIncomingCallOnce");
mustInclude(callClient, "runCallMediaModeGuard");

const nav = "lib/community-messenger/call-session-navigation-seed.ts";
mustNotInclude(nav, "ensureOutgoingTempCallBootstrap");
mustNotInclude(nav, "buildSyntheticTempOutgoingCallSession");
mustNotInclude(nav, "buildCommunityMessengerInstantOutgoingCallHref");
mustNotInclude(nav, "outgoingDial");
mustNotInclude(nav, 'method: "PATCH"', "navigation seed must not issue lifecycle PATCH");
mustInclude(nav, "buildCommunityMessengerCallRouteHref(result.session.id)");
mustInclude(nav, "bootstrapCommunityMessengerOutgoingCallSession");

mustInclude(
  "lib/call/active-call-session.ts",
  "SSOT_CONTRACT: cm-call-lifecycle-local-release releaseLocalCallSession peer PATCH 금지",
);
mustInclude("lib/call/active-call-session.ts", "export async function releaseLocalCallSession");
mustInclude("lib/call/actions/call-end-guard.ts", "patchCommunityMessengerCallSession");
mustInclude("lib/call/actions/call-end-guard.ts", "releaseLocalCallSession");
mustInclude("lib/call/actions/call-accept-guard.ts", 'patchCommunityMessengerCallSession(sid, "accept"');
mustInclude("lib/call/actions/call-media-mode-guard.ts", "patchCommunityMessengerCallSession");
mustInclude("lib/community-messenger/incoming-call-accept-gateway.ts", "runIncomingCallReject");

for (const relPath of [
  "android/app/src/main/java/com/dibay/app/call/CallForegroundService.java",
  "android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java",
  "android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java",
]) {
  mustNotMatch(
    relPath,
    /CallSessionPatchHelper\.patch\([^)]*,\s*sid,\s*"(end|accept|reject|missed)"/,
    `${relPath} must not send peer lifecycle PATCH directly`,
  );
}

mustInclude("android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java", "endCallLocalOnly");
mustInclude("lib/call/native/native-call-service.ts", "endNativeCallServiceLocalOnly");

mustNotInclude(
  "lib/community-messenger/call-route-resume-guard.ts",
  'method: "PATCH"',
  "recovery guard must not send stale outgoing cancel PATCH",
);
mustNotInclude(
  "lib/community-messenger/call-route-exit.ts",
  "hardClearActiveCallSession",
  "route exit must use local cleanup only",
);
mustInclude("lib/community-messenger/call-route-exit.ts", "releaseLocalCallSession");

if (failures.length > 0) {
  console.error("verify:cm-call-lifecycle-contract FAIL\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("verify:cm-call-lifecycle-contract PASS");
