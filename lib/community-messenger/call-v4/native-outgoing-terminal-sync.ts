"use client";

import { callV4FetchSessionForCallerPoll } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { markCallV4NativeConnectedOps } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { clearCallV4MissedTimer } from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import type { CallV4Router } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";

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

function isTerminalSessionStatus(status: string | null | undefined): boolean {
  return TERMINAL_SESSION_STATUSES.has((status ?? "").trim().toLowerCase());
}

function shouldPollForCall(sid: string): boolean {
  const phase = readCallV4Phase();
  const identity = readCallV4Identity();
  if (!OUTGOING_TERMINAL_SYNC_PHASES.has(phase)) return false;
  if (identity?.callId !== sid || identity.direction !== "outgoing") return false;
  return true;
}

async function tickOutgoingTerminalSync(meta: SyncMeta): Promise<void> {
  const sid = meta.callId.trim();
  if (!sid || !shouldPollForCall(sid)) return;
  if (meta.finalizeInFlight) return;

  if (!(await isNativeEstablishmentOwned(sid))) {
    logCallV4("outgoing_terminal_sync_skipped", { callId: sid, reason: "not_native_owned" });
    stopNativeOutgoingTerminalSync(sid);
    return;
  }

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
  logCallV4("outgoing_terminal_sync_start", { callId: sid });
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
