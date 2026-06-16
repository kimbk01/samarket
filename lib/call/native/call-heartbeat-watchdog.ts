"use client";

import { runCallEndGuard } from "@/lib/call/actions/call-end-guard";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { nativeCallService } from "@/lib/call/native/native-call-service";

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

async function pingNativeHeartbeat(callId: string): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    await nativeCallService.heartbeat(callId);
  } catch {
    /* native plugin optional */
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
      stopCallHeartbeatWatchdog(handle.callId);
      await runCallEndGuard({
        sessionId: handle.callId,
        action: "end",
        reason: "heartbeat_timeout",
      });
    })();
  }, CALL_HEARTBEAT_TIMEOUT_MS);
}

/** 통화 active 구간 — 주기 ping + 무응답 시 end */
export function startCallHeartbeatWatchdog(callId: string): void {
  const sid = callId.trim();
  if (!sid || typeof window === "undefined") return;

  stopCallHeartbeatWatchdog(sid);

  const handle: WatchdogHandle = {
    callId: sid,
    intervalId: null,
    timeoutId: null,
    lastPingAt: Date.now(),
  };
  activeWatchdog = handle;

  const ping = () => {
    handle.lastPingAt = Date.now();
    logDibayCallFlow("call_heartbeat_ping", { sessionId: sid, callId: sid }, { repeat: true });
    void pingNativeHeartbeat(sid);
    scheduleTimeout(handle);
  };

  ping();
  handle.intervalId = setInterval(ping, CALL_HEARTBEAT_INTERVAL_MS);
}

export function stopCallHeartbeatWatchdog(callId?: string): void {
  if (!activeWatchdog) return;
  if (callId?.trim() && activeWatchdog.callId !== callId.trim()) return;
  clearWatchdogTimers(activeWatchdog);
  activeWatchdog = null;
}

export function resetCallHeartbeatWatchdogForTests(): void {
  stopCallHeartbeatWatchdog();
}
