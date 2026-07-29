#!/usr/bin/env node
/**
 * Call Authority LOCK static contract.
 * See docs/dibay-call-authority-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustContain(rel, needle, label) {
  const text = read(rel);
  if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)} in ${rel}`);
}

function mustNotContain(rel, needle, label) {
  const text = read(rel);
  if (text.includes(needle)) failures.push(`${label}: forbidden ${JSON.stringify(needle)} in ${rel}`);
}

// Duration Authority exists and forbids startedAt ring fallback in UI helper
mustContain(
  "lib/community-messenger/call-authority/call-duration-authority.ts",
  "resolveAuthoritativeCallDurationSeconds",
  "duration-authority",
);
mustContain(
  "lib/community-messenger/call-log-row-copy.ts",
  "resolveAuthoritativeCallDurationSeconds",
  "call-log-row-copy-uses-authority",
);
mustNotContain(
  "lib/community-messenger/call-log-row-copy.ts",
  "Math.max(1, Math.round((ended - started)",
  "no-startedAt-duration-fallback",
);

// Terminal reason Authority + trusted heartbeat/redial
mustContain(
  "lib/community-messenger/call-authority/call-terminal-reason-authority.ts",
  "heartbeat_timeout",
  "terminal-reason-heartbeat",
);
mustContain(
  "lib/community-messenger/call-authority/call-terminal-reason-authority.ts",
  "redial_replaced",
  "terminal-reason-redial",
);
mustContain(
  "lib/community-messenger/service.ts",
  "resolveTerminalEndedReason",
  "service-uses-terminal-authority",
);
mustContain(
  "lib/community-messenger/service.ts",
  "resolveAuthoritativeCallDurationSeconds",
  "service-uses-duration-authority",
);

// Missed evidence catch must not bypass notify
mustContain(
  "lib/community-messenger/service.ts",
  "missed_notify_skipped_after_error",
  "missed-no-catch-bypass",
);

// forceEnd routes through updateCommunityMessengerCallSession
mustContain(
  "lib/community-messenger/service.ts",
  'clientEndedReason: "redial_replaced"',
  "forceEnd-via-update-session",
);

// iOS answered_elsewhere completion(false)
mustContain(
  "ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift",
  "completion(false)",
  "ios-voice-answered-elsewhere-completion",
);
mustContain(
  "ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift",
  "completion(false)",
  "ios-video-answered-elsewhere-completion",
);

// Android FGS null intent → NOT_STICKY
mustContain(
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallService.java",
  "if (intent == null)",
  "android-voice-fgs-null-intent",
);
mustContain(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java",
  "if (intent == null)",
  "android-video-fgs-null-intent",
);
mustContain(
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java",
  "incoming_busy_suppressed",
  "android-voice-busy-suppress",
);
mustContain(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
  "incoming_busy_suppressed",
  "android-video-busy-suppress",
);

// LOCK doc present
mustContain("docs/dibay-call-authority-lock.md", "Final Authority", "lock-doc");

if (failures.length) {
  console.error("verify:call-authority-contract FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify:call-authority-contract PASS");
