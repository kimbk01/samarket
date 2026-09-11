"use client";

import { patchCallSessionHeartbeat } from "@/lib/call/call-server-heartbeat-client";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { nativeCallService } from "@/lib/call/native/native-call-service";
import { callEngineActions } from "@/lib/community-messenger/call-engine";

/** force-stop 은 onTaskRemoved 미보장 — JS↔Native heartbeat 로 보완 */
export const CALL_HEARTBEAT_INTERVAL_MS = 10_000;
export const CALL_HEARTBEAT_TIMEOUT_MS = 35_000;

type WatchdogHandle = {
  callId: string;
  intervalId: ReturnType<typeof setInterval> | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
  lastPingAt: number;
};

let activeWatchdog: WatchdogHandle | null = null;

/**
 * CallClient heartbeat ownership SSOT.
 *
 * - `start`: Web Agora joined on active session (CallClient may start)
 * - `retain`: active session without joined — Native-established path may own watchdog;
 *   `!joined` alone MUST NOT stop
 * - `stop`: terminal / idle / non-active lifecycle only
 */
export type CallClientHeartbeatAction = "start" | "stop" | "retain";

export function resolveCallClientHeartbeatAction(input: {
  isTerminal: boolean;
  phase: string;
  joined: boolean;
}): CallClientHeartbeatAction {
  if (input.isTerminal) return "stop";
  if (input.phase === "idle") return "stop";
  if (input.phase === "active" && input.joined) return "start";
  if (input.phase === "active") return "retain";
  return "stop";
}

function clearWatchdogTimers(handle: WatchdogHandle): void {
  if (handle.intervalId != null) {
    clearInterval(handle.intervalId);
    handle.intervalId = null;
  }
  if (handle.timeoutId != null) {
    clearTimeout(handle.timeoutId);
    handle.timeoutId = null;
  }
}

export function isCallHeartbeatWatchdogActive(callId?: string): boolean {
  if (!activeWatchdog) return false;
  if (!callId?.trim()) return true;
  return activeWatchdog.callId === callId.trim();
}

export function getActiveCallHeartbeatWatchdogCallId(): string | null {
  return activeWatchdog?.callId ?? null;
}

async function pingNativeHeartbeat(callId: string): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    await nativeCallService.heartbeat(callId);
  } catch {
    /* native plugin optional */
  }
}

async function pingServerHeartbeat(callId: string, reconnecting: boolean): Promise<void> {
  try {
    const result = await patchCallSessionHeartbeat(callId, { reconnecting });
    if (result.ok) {
      console.info("[DIBAY_CALL] heartbeat_patch_ok", { callId, at: Date.now(), reconnecting });
    }
  } catch {
    /* best-effort */
  }
}

function scheduleTimeout(handle: WatchdogHandle): void {
  if (handle.timeoutId != null) clearTimeout(handle.timeoutId);
  handle.timeoutId = setTimeout(() => {
    void (async () => {
      const elapsed = Date.now() - handle.lastPingAt;
      if (elapsed < CALL_HEARTBEAT_TIMEOUT_MS - 500) return;
      if (isCapacitorNativePlatform()) {
        const nativeId = (await nativeCallService.getActiveCallId())?.trim();
        if (nativeId && nativeId === handle.callId) {
          handle.lastPingAt = Date.now();
          scheduleTimeout(handle);
          return;
        }
      }
      logDibayCallFlow("call_heartbeat_timeout", {
        sessionId: handle.callId,
        callId: handle.callId,
        elapsedMs: elapsed,
        reason: "js_watchdog",
      });
      stopCallHeartbeatWatchdog(handle.callId, "js_watchdog_timeout");
      await callEngineActions.patch({
        callId: handle.callId,
        action: "end",
        init: { clientEndedReason: "heartbeat_timeout" },
        source: "heartbeat_watchdog",
      });
    })();
  }, CALL_HEARTBEAT_TIMEOUT_MS);
}

/** 통화 active 구간 — 주기 ping + 무응답 시 end */
export function startCallHeartbeatWatchdog(callId: string, source = "unspecified"): void {
  const sid = callId.trim();
  if (!sid || typeof window === "undefined") return;

  stopCallHeartbeatWatchdog(sid, "restart_before_start");

  const handle: WatchdogHandle = {
    callId: sid,
    intervalId: null,
    timeoutId: null,
    lastPingAt: Date.now(),
  };
  activeWatchdog = handle;

  logDibayCallFlow(
    "call_heartbeat_watchdog_start",
    { sessionId: sid, callId: sid, source },
    { repeat: true },
  );

  const ping = () => {
    handle.lastPingAt = Date.now();
    logDibayCallFlow("call_heartbeat_ping", { sessionId: sid, callId: sid }, { repeat: true });
    void pingNativeHeartbeat(sid);
    void pingServerHeartbeat(sid, false);
    scheduleTimeout(handle);
  };

  ping();
  handle.intervalId = setInterval(ping, CALL_HEARTBEAT_INTERVAL_MS);
}

export function stopCallHeartbeatWatchdog(callId?: string, reason = "unspecified"): void {
  if (!activeWatchdog) return;
  if (callId?.trim() && activeWatchdog.callId !== callId.trim()) return;
  const stoppedId = activeWatchdog.callId;
  clearWatchdogTimers(activeWatchdog);
  activeWatchdog = null;
  logDibayCallFlow(
    "call_heartbeat_watchdog_stop",
    { sessionId: stoppedId, callId: stoppedId, reason, source: reason },
    { repeat: true },
  );
}

export function resetCallHeartbeatWatchdogForTests(): void {
  stopCallHeartbeatWatchdog(undefined, "test_reset");
}
