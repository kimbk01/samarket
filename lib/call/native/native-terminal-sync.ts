"use client";

import type { PluginListenerHandle } from "@capacitor/core";
import { cleanupCallV4 } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { clearCallV4MissedTimer } from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import { stopNativeOutgoingTerminalSync } from "@/lib/community-messenger/call-v4/native-outgoing-terminal-sync";
import {
  readCallV4Identity,
  releaseCallV4OutgoingGateAfterTerminalFinalize,
  useCallV4Store,
} from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  NATIVE_CALL_TERMINAL_EVENT,
  endNativeCallService,
  nativeCallServicePlugin,
  type NativeCallTerminalPayload,
} from "@/lib/call/native/native-call-service";
import {
  clearNativeConnectedHydrationForCall,
  flushPendingNativeConnected,
} from "@/lib/call/native/native-connected-sync";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

const handledNativeLocalTerminal = new Set<string>();
const pendingNativeLocalTerminal: NativeCallTerminalPayload[] = [];
let nativeTerminalListenerReady = false;

async function deliverNativeLocalTerminal(payload: NativeCallTerminalPayload): Promise<void> {
  if (!nativeTerminalListenerReady) {
    pendingNativeLocalTerminal.push(payload);
    return;
  }
  await flushPendingNativeConnected();
  await onNativeCallLocalTerminal(payload);
}

async function flushPendingNativeLocalTerminal(): Promise<void> {
  nativeTerminalListenerReady = true;
  await flushPendingNativeConnected();
  const queued = pendingNativeLocalTerminal.splice(0);
  for (const payload of queued) {
    await onNativeCallLocalTerminal(payload);
  }
}

function mapNativeTerminalReason(reason: string): string {
  const normalized = reason.trim().toLowerCase();
  if (normalized === "rejected" || normalized === "declined") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "failed") return "failed";
  return "ended";
}

/** Native local end — immediate idle for re-dial; HTTP/native cleanup continues async. */
export async function onNativeCallLocalTerminal(payload: NativeCallTerminalPayload): Promise<void> {
  const sid = payload.callId?.trim() ?? "";
  if (!sid || payload.nativeOwned !== true) return;

  logCallV4("native_local_terminal_received", {
    callId: sid,
    reason: payload.reason,
    source: payload.source,
  });

  const identity = readCallV4Identity();
  if (identity?.callId !== sid) {
    logCallV4("native_local_terminal_ignored", { callId: sid, reason: "not_current_identity" });
    // Remote terminal may have cleared Web identity while native VC is still visible — best-effort cleanup.
    void endNativeCallService(sid, "native_stale_terminal");
    return;
  }

  if (handledNativeLocalTerminal.has(sid)) {
    logCallV4("native_local_terminal_ignored", { callId: sid, reason: "duplicate" });
    return;
  }
  handledNativeLocalTerminal.add(sid);

  const terminalStatus = mapNativeTerminalReason(payload.reason);
  clearCallV4MissedTimer(sid);
  stopNativeOutgoingTerminalSync(sid);
  clearNativeConnectedHydrationForCall(sid);
  releaseCallV4OutgoingGateAfterTerminalFinalize({
    callId: sid,
    status: terminalStatus,
    source: payload.source,
  });
  useCallV4Store.getState().resetToIdle();
  logCallV4("native_local_terminal_idle_immediate", { callId: sid, status: terminalStatus });

  void cleanupCallV4(sid, terminalStatus).catch((error: unknown) => {
    logCallV4("native_local_terminal_cleanup_failed", {
      callId: sid,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/** iOS native local end — subscribe for immediate Web idle (re-dial gate). */
export function startNativeTerminalSync(): () => void {
  if (!isCapacitorNativePlatform()) {
    return () => undefined;
  }
  const platform = resolveCapacitorShellPlatform();
  if (platform !== "ios") {
    return () => undefined;
  }
  if (typeof window === "undefined") return () => undefined;

  let disposed = false;
  let handle: PluginListenerHandle | null = null;

  void nativeCallServicePlugin.addListener(NATIVE_CALL_TERMINAL_EVENT, (payload) => {
    void deliverNativeLocalTerminal(payload as NativeCallTerminalPayload);
  })
    .then((subscription) => {
      if (disposed) {
        void subscription.remove();
        return;
      }
      handle = subscription;
      void flushPendingNativeLocalTerminal();
    })
    .catch(() => {
      /* plugin optional until native shell ready */
    });

  return () => {
    disposed = true;
    if (handle) void handle.remove();
    handle = null;
  };
}

export function clearNativeLocalTerminalHandledForCall(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  handledNativeLocalTerminal.delete(sid);
}

export function resetNativeTerminalSyncForTests(): void {
  handledNativeLocalTerminal.clear();
  pendingNativeLocalTerminal.length = 0;
  nativeTerminalListenerReady = false;
}

export type { NativeCallTerminalPayload };
