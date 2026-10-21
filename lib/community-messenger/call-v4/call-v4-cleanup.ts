import { stopCallHeartbeatWatchdog } from "@/lib/call/native/call-heartbeat-watchdog";
import { stopCallV4CallerActivePoll } from "@/lib/community-messenger/call-v4/call-v4-caller-active";
import { stopCallV4ConnectedTerminalWatch } from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { clearCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { clearCallV4WebCallScreenReady } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { clearCallV4NativeAcceptingSurface, clearCallV4NativeIncomingSurface, clearCallV4SurfaceOwner } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { clearNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { syncCallV4NativeTerminalCleanup } from "@/lib/community-messenger/call-v4/call-v4-native-lifecycle";
import { useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { stopCallV4NativeActiveSession } from "@/lib/community-messenger/call-v4/call-v4-native-active-session";
import { resetCallV4AcceptPatchStateForCallId } from "@/lib/community-messenger/call-v4/call-v4-patch-guard";
import { forceResetCommunityMessengerCallRuntimeSurface } from "@/lib/community-messenger/call-runtime-registry";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { clearNativeConnectedHydrationForCall } from "@/lib/call/native/native-connected-sync";
import { clearNativeLocalTerminalHandledForCall } from "@/lib/call/native/native-terminal-sync";
import { releaseConnectedVideoScreenAwake } from "@/lib/call/native/screen-awake-bridge";

function logCleanupStepFailure(callId: string, step: string, error: unknown): void {
  logCallV4("cleanup_step_failed", {
    callId,
    step,
    error: error instanceof Error ? error.message : String(error),
  });
}

const NATIVE_ACTIVE_SESSION_STOP_TIMEOUT_MS = 1_500;

async function stopCallV4NativeActiveSessionWithTimeout(callId: string, reason: string): Promise<void> {
  await Promise.race([
    stopCallV4NativeActiveSession(callId, reason),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        logCallV4("cleanup_native_active_session_timeout", { callId, reason, timeoutMs: NATIVE_ACTIVE_SESSION_STOP_TIMEOUT_MS });
        resolve();
      }, NATIVE_ACTIVE_SESSION_STOP_TIMEOUT_MS);
    }),
  ]);
}

const NON_TERMINAL_LIVE_PHASES = new Set([
  "creating",
  "outgoing_ringing",
  "incoming_ringing",
  "accepting",
  "joining",
  "connected",
]);

/**
 * C-11: 전역 통화 상태(caller poll·미디어 store·런타임 표면·V4 phase)는 **이 callId 가 아직 주인일 때만** 지운다.
 * 이전 통화 cleanup 의 await(Agora leave·오디오 해제·native stop 최대 1.5s) 사이 새 발신이 시작되면
 * 늦은 reset 이 새 통화를 idle 로 지워 이중 발신 가드를 풀던 경합을 막는다.
 */
export function callV4CleanupOwnsGlobalState(callId: string): boolean {
  const sid = callId.trim();
  const st = useCallV4Store.getState();
  if (st.identity) return st.identity.callId === sid;
  /** identity 가 없는데 live phase 면 새 발신(creating) 이 진행 중 — 이전 cleanup 이 건드리지 않는다 */
  return !NON_TERMINAL_LIVE_PHASES.has(st.phase);
}

export async function cleanupCallV4(callId: string, reason: CallV4TerminalPhase | string): Promise<void> {
  const sid = callId.trim();
  logCallV4("cleanup_start", { callId: sid, reason });
  releaseConnectedVideoScreenAwake(sid, String(reason));
  clearCallV4WebCallScreenReady(sid);
  stopCallHeartbeatWatchdog(sid, `v4_cleanup:${String(reason)}`);
  logCallV4("call_heartbeat_watchdog_stop", { callId: sid, reason });
  if (callV4CleanupOwnsGlobalState(sid)) stopCallV4CallerActivePoll();
  else logCallV4("cleanup_global_skip_foreign_owner", { callId: sid, step: "caller_active_poll" });
  stopCallV4ConnectedTerminalWatch(sid);
  try {
    const { leaveCallV4Agora } = await import("@/lib/community-messenger/call-v4/call-v4-agora");
    await leaveCallV4Agora(sid);
  } catch (error) {
    logCleanupStepFailure(sid, "leave_agora", error);
  }
  const { releaseCallV4AudioRoute } = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
  await releaseCallV4AudioRoute(sid, "v4_cleanup");
  clearCallV4ConnectionWarm(sid);
  resetCallV4AcceptPatchStateForCallId(sid);
  clearCallV4NativeAcceptingSurface(sid);
  clearNativeAcceptInflight(sid, String(reason));
  syncCallV4NativeTerminalCleanup(sid, reason);
  clearCallV4NativeIncomingSurface(sid, "cleanup");
  clearCallV4SurfaceOwner(sid, "cleanup");
  clearNativeConnectedHydrationForCall(sid);
  clearNativeLocalTerminalHandledForCall(sid);
  if (callV4CleanupOwnsGlobalState(sid)) {
    useCallV4MediaStore.getState().reset();
    forceResetCommunityMessengerCallRuntimeSurface();
  } else {
    logCallV4("cleanup_global_skip_foreign_owner", { callId: sid, step: "media_runtime_reset" });
  }
  try {
    await stopCallV4NativeActiveSessionWithTimeout(sid, String(reason));
  } catch (error) {
    logCleanupStepFailure(sid, "stop_native_active_session", error);
  }
  /** await 뒤 다시 확인 — 그 사이 새 통화가 시작됐으면 idle 로 되돌리지 않는다 */
  if (callV4CleanupOwnsGlobalState(sid)) useCallV4Store.getState().resetToIdle();
  else logCallV4("cleanup_global_skip_foreign_owner", { callId: sid, step: "reset_to_idle" });
  logCallV4("cleanup_done", { callId: sid, reason });
}
