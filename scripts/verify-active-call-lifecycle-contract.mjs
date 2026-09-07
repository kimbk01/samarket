#!/usr/bin/env node
/**
 * P4 Active Call lifecycle contract — static grep checks.
 * Usage: npm run verify:active-call-lifecycle-contract
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error(`verify:active-call-lifecycle-contract FAIL — ${msg}`);
  process.exit(1);
}

const machine = read("lib/call/active-call-session-machine.ts");
if (!machine.includes("activity_destroyed") || !machine.includes("canCleanupActiveCall")) {
  fail("active-call-session-machine missing forbidden cleanup reasons");
}

const activeSession = read("lib/call/active-call-session.ts");
if (!activeSession.includes("active_call_cleanup_blocked") || !activeSession.includes("canCleanupActiveCall")) {
  fail("hardClearActiveCallSession must block forbidden cleanup");
}
if (!activeSession.includes("reportNativeCallRemoteEnded")) {
  fail("hardClear must bridge remote terminal to native reportRemoteEnded");
}

const nativeBridge = read("lib/call/native/native-call-service.ts");
if (!nativeBridge.includes("reportRemoteEnded") || !nativeBridge.includes("reportNativeCallRemoteEnded")) {
  fail("native-call-service reportRemoteEnded bridge missing");
}

const callClient = read("components/community-messenger/CommunityMessengerCallClient.tsx");
if (!callClient.includes("pagehide") || !callClient.includes("joinedRef.current) return")) {
  fail("CallClient must keep Agora on pagehide when active+joined");
}
if (!callClient.includes("session.status !== \"active\" || !joined") || !callClient.includes("BACKGROUNDED")) {
  fail("CallClient voice+video background lifecycle missing");
}
if (!callClient.includes("RECONNECTING") || !callClient.includes("patchCallSessionHeartbeat")) {
  fail("CallClient RECONNECTING + heartbeat reconnect flag missing");
}

const androidMgr = read("android/app/src/main/java/com/dibay/app/call/DibayActiveCallSessionManager.java");
if (!androidMgr.includes("active_call_cleanup_blocked") || !androidMgr.includes("FORBIDDEN_CLEANUP")) {
  fail("Android DibayActiveCallSessionManager missing cleanup guard");
}
if (!androidMgr.includes('"missed"') || !androidMgr.includes("CONNECTED.get()")) {
  fail("Android DibayActiveCallSessionManager must block missed cleanup while connected");
}

const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
if (!fgs.includes("onTaskRemoved") || !fgs.includes("task_removed_keep_foreground_service")) {
  fail("CallForegroundService must keep call on task removed");
}
if (!fgs.includes("setDeleteIntent(null)")) {
  fail("ongoing notification must not end call on dismiss");
}

const iosMgr = read("ios/App/App/Call/DibayActiveCallSessionManager.swift");
if (!iosMgr.includes("forbiddenCleanup") || !iosMgr.includes("ios_call_background_keep_alive")) {
  fail("iOS DibayActiveCallSessionManager incomplete");
}
if (!iosMgr.includes("onRemoteEnded")) {
  fail("iOS onRemoteEnded bridge missing");
}

const iosAudio = read("ios/App/App/Call/DibayCallAudioSessionController.swift");
if (!iosAudio.includes("interruptionNotification")) {
  fail("iOS AVAudioSession interruption observer missing");
}

const iosPlugin = read("ios/App/App/Plugins/NativeCallServicePlugin.swift");
if (!iosPlugin.includes("reportRemoteEnded")) {
  fail("iOS NativeCallService reportRemoteEnded missing");
}

const androidPlugin = read("android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java");
if (!androidPlugin.includes("reportRemoteEnded")) {
  fail("Android NativeCallService reportRemoteEnded missing");
}

const heartbeat = read("lib/community-messenger/call-session-heartbeat.ts");
if (!heartbeat.includes("heartbeatCommunityMessengerCallSession")) {
  fail("server heartbeat module missing");
}
if (!heartbeat.includes("canEndActiveCallForPresenceStale")) {
  fail("CUT1: heartbeat cleanup must use both-stale Presence SSOT");
}
if (!heartbeat.includes("updateCommunityMessengerCallSession")) {
  fail("CUT1: heartbeat stale end must call updateCommunityMessengerCallSession");
}
if (!heartbeat.includes("CALL_SERVER_HEARTBEAT_ENDED_REASON")) {
  fail("heartbeat_timeout ended reason missing from cleanup path");
}

const stalePolicy = read("lib/call/call-server-heartbeat.ts");
if (!stalePolicy.includes("CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS")) {
  fail("heartbeat grace after answer missing");
}
if (!stalePolicy.includes("One-sided stale MUST NOT")) {
  fail("one-sided stale must remain documented as non-authority");
}

const presence = read("lib/call/call-active-presence.ts");
if (!presence.includes("canEndActiveCallForPresenceStale") || !presence.includes("both")) {
  fail("Presence SSOT both-stale helper missing");
}

const terminalWriter = read(
  "lib/community-messenger/call-authority/call-terminal-writer-authority.ts",
);
if (!terminalWriter.includes("CALL_TERMINAL_SESSION_WRITER")) {
  fail("CUT1 terminal writer authority module missing");
}

const cut1 = read("supabase/migrations/20261210120000_cm_call_terminal_writer_ssot_cut1.sql");
if (!cut1.includes("cleanup_stale_community_messenger_call_sessions")) {
  fail("CUT1 migration missing detect-only function");
}
if (/SET\s+status\s*=\s*'ended'/i.test(cut1) || /ended_reason\s*=\s*'heartbeat_timeout'/i.test(cut1)) {
  fail("CUT1 migration must not mutate terminal fields");
}
if (!cut1.includes("AND caller_last_heartbeat_at < stale_cutoff") || !cut1.includes("AND callee_last_heartbeat_at < stale_cutoff")) {
  fail("CUT1 detect predicate must be both-stale AND");
}
if (!cut1.includes("unschedule") || !cut1.includes("cleanup_stale_cm_call_sessions")) {
  fail("CUT1 must unschedule legacy mutating pg_cron job");
}

const vercel = read("vercel.json");
if (!vercel.includes("/api/community-messenger/calls/sessions/stale-cleanup")) {
  fail("CUT1: vercel.json must schedule app stale-cleanup cron");
}

const staleRoute = read("app/api/community-messenger/calls/sessions/stale-cleanup/route.ts");
if (!staleRoute.includes("cleanupStaleActiveCommunityMessengerCallSessions")) {
  fail("stale-cleanup route must call TS cleanup (canonical writer path)");
}

const staleCronLegacy = read("supabase/migrations/20260618150000_community_messenger_call_stale_cron.sql");
if (!staleCronLegacy.includes("cleanup_stale_community_messenger_call_sessions") || !staleCronLegacy.includes("pg_cron")) {
  fail("historical pg_cron stale cleanup migration missing (keep for history)");
}

console.log("verify:active-call-lifecycle-contract PASS");
