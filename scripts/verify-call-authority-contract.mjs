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

// Room-bound missed is Conversation B only; no parallel notification_event/Bell writer.
mustContain(
  "lib/community-messenger/service.ts",
  "Room-bound missed is the terminal call_stub Conversation B fact",
  "room-bound-missed-b-only",
);
mustNotContain(
  "lib/community-messenger/service.ts",
  "notifyMissedCallPipeline",
  "no-room-bound-missed-bell-writer",
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
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java",
  "action=suppress_no_reject",
  "android-voice-busy-no-reject",
);
mustContain(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
  "incoming_busy_suppressed",
  "android-video-busy-suppress",
);
mustContain(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
  "action=suppress_no_reject",
  "android-video-busy-no-reject",
);
mustContain(
  "lib/community-messenger/service.ts",
  'clientEndedReason: "incoming_policy_superseded"',
  "incoming-policy-supersede-reason",
);
mustContain(
  "lib/community-messenger/service.ts",
  "resolveCanonicalCallLogPeerUserId",
  "history-peer-authority",
);
mustContain(
  "lib/community-messenger/service.ts",
  "resolveTerminalStubActorUserId",
  "terminal-stub-actor-authority",
);
mustContain(
  "lib/community-messenger/service.ts",
  "incrementUnread: true",
  "terminal-stub-atomic-unread",
);
mustNotContain(
  "lib/community-messenger/service.ts",
  'peerUserId: mapped.sessionMode === "direct" ? mapped.peerUserId : null',
  "no-viewer-relative-call-log-peer",
);

mustContain(
  "ios/App/App/Push/VoIPPushRegistry.swift",
  "endCallKitSessionIfUuidKnown",
  "ios-cancel-orphan-safe-end",
);
mustContain(
  "ios/App/App/Push/CallKitProvider.swift",
  "markTerminalSuppressed",
  "ios-terminal-suppress",
);
mustContain(
  "ios/App/App/Push/CallKitProvider.swift",
  "terminal_suppress_after_incoming",
  "ios-late-incoming-after-cancel",
);

// LOCK doc present
mustContain("docs/dibay-call-authority-lock.md", "Final Authority", "lock-doc");
mustContain("docs/dibay-call-authority-lock.md", "iOS caller-cancel while ringing", "lock-ios-cancel");
mustContain("docs/dibay-call-authority-lock.md", "History peer", "lock-history-peer");
mustContain(
  "docs/dibay-call-authority-lock.md",
  "Terminal timeline unread (LOCKED)",
  "lock-terminal-timeline-unread",
);
mustContain(
  "docs/dibay-call-authority-lock.md",
  "Room-bound missed is call_stub/B only",
  "lock-room-bound-missed-b-only",
);
mustContain(
  "docs/dibay-call-authority-lock.md",
  "first-unread/divider ordering",
  "lock-terminal-unread-phase4-status",
);

if (failures.length) {
  console.error("verify:call-authority-contract FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify:call-authority-contract PASS");
