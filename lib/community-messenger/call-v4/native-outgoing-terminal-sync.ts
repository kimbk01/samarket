"use client";

import { callV4FetchSessionForCallerPoll } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { markCallV4NativeConnectedOps } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { clearCallV4MissedTimer } from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import type { CallV4Router } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

const OUTGOING_TERMINAL_SYNC_POLL_MS = 500;

const OUTGOING_TERMINAL_SYNC_PHASES = new Set<CallV4Phase>(["creating", "outgoing_ringing"]);

const TERMINAL_SESSION_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "ended",
  "missed",
  "failed",
]);

type SyncMeta = {
  timerId: ReturnType<typeof setInterval>;
  callId: string;
  router?: CallV4Router;
  finalizeInFlight: boolean;
};

let activeSync: SyncMeta | null = null;

export function isTerminalSessionStatus(status: string | null | undefined): boolean {
  return TERMINAL_SESSION_STATUSES.has((status ?? "").trim().toLowerCase());
}

/**
 * R3-a (docs/audit/messenger-2026-10-26-r3-call-session-poll-plan.md §8): on iOS the native runtime
 * owns server status while it owns the outgoing call — `NativeOutgoingTerminalWatch` reads the
 * session every 1s (stops on `active`) and `nativeCallConnected` promotes the Web store. The Web tick
 * then only watches ownership; the single GET is `finalizeAfterNativeReleased`. Android has no native
 * session watch, so this HTTP poll stays as its only backup when the FCM terminal push is late or lost.
 */
function isServerStatusOwnedByNativeWatch(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";
}

function shouldPollForCall(sid: string): boolean {
  const phase = readCallV4Phase();
  const identity = readCallV4Identity();
  if (!OUTGOING_TERMINAL_SYNC_PHASES.has(phase)) return false;
  if (identity?.callId !== sid || identity.direction !== "outgoing") return false;
  return true;
}

/**
 * iOS native closed the outgoing screen on its own (e.g. remote reject seen while WebKit had this
 * page suspended) — the Web store is still `outgoing_ringing`. Read the server once and finalize
 * through the same SSOT path as a Web-detected terminal (idle + caller notice); otherwise the store
 * waits for the 30s missed timer and blocks re-dial
 * (docs/audit/messenger-2026-10-26-ios-caller-remote-terminal-design.md §11·§12).
 */
async function finalizeAfterNativeReleased(meta: SyncMeta): Promise<void> {
  const sid = meta.callId.trim();
  meta.finalizeInFlight = true;
  const fetchResult = await callV4FetchSessionForCallerPoll(sid);
  const status = fetchResult.session?.status ?? null;
  if (!isTerminalSessionStatus(status)) {
    logCallV4("outgoing_terminal_sync_skipped", { callId: sid, reason: "not_native_owned", status });
    stopNativeOutgoingTerminalSync(sid);
    return;
  }

  logCallV4("outgoing_terminal_sync_detected", { callId: sid, status, reason: "native_released" });
  stopNativeOutgoingTerminalSync(sid);

  const mod = await import("@/lib/community-messenger/call-v4/call-v4-actions");
  await mod.callV4HandleRemoteTerminal(sid, status, meta.router, "outgoing_terminal_sync_native_released");
}

async function tickOutgoingTerminalSync(meta: SyncMeta): Promise<void> {
  const sid = meta.callId.trim();
  if (!sid || !shouldPollForCall(sid)) return;
  if (meta.finalizeInFlight) return;

  if (!(await isNativeEstablishmentOwned(sid))) {
    await finalizeAfterNativeReleased(meta);
    return;
  }

  if (isServerStatusOwnedByNativeWatch()) return;

  const fetchResult = await callV4FetchSessionForCallerPoll(sid);
  logCallV4("outgoing_terminal_sync_poll", {
    callId: sid,
    status: fetchResult.session?.status ?? null,
    notFound: fetchResult.notFound,
    phase: readCallV4Phase(),
  });

  const status = fetchResult.session?.status ?? null;
  if (status === "active") {
    const phase = readCallV4Phase();
    if (phase === "outgoing_ringing" && readCallV4Identity()?.callId === sid) {
      useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
      markCallV4NativeConnectedOps(sid, "outgoing_terminal_sync_active");
      clearCallV4MissedTimer(sid);
      logCallV4("outgoing_terminal_sync_promoted_connected", { callId: sid });
    }
    stopNativeOutgoingTerminalSync(sid);
    return;
  }

  if (!isTerminalSessionStatus(status)) {
    return;
  }

  meta.finalizeInFlight = true;
  logCallV4("outgoing_terminal_sync_detected", { callId: sid, status });
  stopNativeOutgoingTerminalSync(sid);

  const mod = await import("@/lib/community-messenger/call-v4/call-v4-actions");
  await mod.callV4HandleRemoteTerminal(sid, status, meta.router, "outgoing_terminal_sync");
}

/** Native-owned outgoing — poll server terminal status and sync Web store via SSOT finalize. */
export function startNativeOutgoingTerminalSync(callId: string, router?: CallV4Router): () => void {
  const sid = callId.trim();
  if (!sid) return () => undefined;

  stopNativeOutgoingTerminalSync();

  const meta: SyncMeta = {
    callId: sid,
    router,
    finalizeInFlight: false,
    timerId: setInterval(() => {
      void tickOutgoingTerminalSync(meta).catch((error: unknown) => {
        logCallV4("outgoing_terminal_sync_tick_failed", {
          callId: sid,
          error: error instanceof Error ? error.message : String(error),
        });
        if (activeSync === meta) {
          meta.finalizeInFlight = false;
        }
      });
    }, OUTGOING_TERMINAL_SYNC_POLL_MS),
  };

  activeSync = meta;
  logCallV4("outgoing_terminal_sync_start", {
    callId: sid,
    serverPoll: isServerStatusOwnedByNativeWatch() ? "native_watch" : "web_http",
  });
  void tickOutgoingTerminalSync(meta);

  return () => stopNativeOutgoingTerminalSync(sid);
}

export function stopNativeOutgoingTerminalSync(callId?: string): void {
  if (!activeSync) return;
  const target = callId?.trim();
  if (target && activeSync.callId !== target) return;
  clearInterval(activeSync.timerId);
  logCallV4("outgoing_terminal_sync_stop", { callId: activeSync.callId });
  activeSync = null;
}

export function resetNativeOutgoingTerminalSyncForTests(): void {
  stopNativeOutgoingTerminalSync();
}
