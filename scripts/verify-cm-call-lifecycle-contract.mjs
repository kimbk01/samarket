#!/usr/bin/env node
/**
 * DIBAY call lifecycle SSOT static contract (current Native Runtime cutover).
 * @see docs/community-messenger/call-lifecycle-ssot.md
 *
 * Enforces evidenced current owners — does not require deleted guards or
 * aspirational removals that are still present as legacy helpers.
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

function mustNotMatch(relPath, regex, message) {
  const src = read(relPath);
  if (regex.test(src)) failures.push(message ?? `${relPath} matched ${regex}`);
}

function mustNotExist(relPath, message) {
  if (fs.existsSync(path.join(ROOT, relPath))) {
    failures.push(message ?? `${relPath} must not exist`);
  }
}

mustInclude("docs/community-messenger/call-lifecycle-ssot.md", "DIBAY Call Lifecycle SSOT");
mustInclude(".cursor/rules/cm-call-lifecycle-contract.mdc", "DIBAY Call Lifecycle SSOT");

mustNotExist(
  "lib/call/actions/call-accept-guard.ts",
  "stale call-accept-guard.ts — accept is incoming-call-accept-gateway"
);

mustInclude("lib/community-messenger/incoming-call-accept-gateway.ts", "acceptIncomingCallOnce");
mustInclude("lib/community-messenger/incoming-call-accept-gateway.ts", "runIncomingCallReject");
mustInclude("lib/call/actions/call-end-guard.ts", "runCallEndGuard");
mustInclude("lib/call/actions/call-start-guard.ts", "runCallStartGuard");
mustInclude(
  "lib/call/active-call-session.ts",
  "SSOT_CONTRACT: cm-call-lifecycle-local-release releaseLocalCallSession peer PATCH 금지"
);
mustInclude("lib/call/active-call-session.ts", "export async function releaseLocalCallSession");

mustInclude(
  "lib/community-messenger/call-session-navigation-seed.ts",
  "bootstrapCommunityMessengerOutgoingCallSession"
);
mustInclude(
  "lib/community-messenger/call-session-navigation-seed.ts",
  "ringing mid-call tip/stub is Native UI only"
);

mustInclude(
  "app/api/community-messenger/rooms/[roomId]/calls/route.ts",
  "dispatchIncomingCallVoipOnCriticalPath"
);
mustNotMatch(
  "app/api/community-messenger/rooms/[roomId]/calls/route.ts",
  /after\s*\(\s*async/,
  "incoming VoIP must not use deferred after-hook"
);

mustInclude(
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java",
  "IncomingCallSurfaceOwner.tryClaimIncomingOwner"
);
mustInclude(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
  "IncomingCallSurfaceOwner.tryClaimIncomingOwner"
);
mustInclude(
  "android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java",
  "NativeVideoCallOwner.isNativeOwned"
);

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

mustInclude("lib/call/native/native-call-service.ts", "endNativeCallService");
mustInclude("components/layout/providers/CallIncomingChrome.tsx", "isLegacyWebCallEstablishmentRemoved");
mustInclude("components/community-messenger/call-v4/CallV4Provider.tsx", "syncOnly");

if (failures.length > 0) {
  console.error("verify:cm-call-lifecycle-contract FAIL\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("verify:cm-call-lifecycle-contract PASS");
