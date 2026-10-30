import type { NativeActiveCallProbe, NativeBringToFrontResult } from "@/lib/call/native/native-call-service";

/**
 * 앱 전체 통화 바 (S1) — 표시 판정만 담당하는 순수 규칙.
 * 설계: docs/audit/call-inapp-multitask-legacy-design-2026-10-30.md §4·§14.2
 *
 * 표시 = A(복귀 지원 바이너리) · B(웹 스토어 connected + callId X) · C(네이티브 확인 = X) 모두 참.
 * 네이티브 확인 `unknown`(조회 실패)은 종료로 보지 않고 현재 표시 상태를 유지한다.
 */

export const NATIVE_CALL_BAR_PROBE_INTERVAL_MS = 5000;

export type NativeCallBarInput = {
  supported: boolean;
  phase: string;
  storeCallId: string | null;
  /** 이번에 받은 네이티브 확인 결과 (아직 확인 전이면 null) */
  probe: NativeActiveCallProbe | null;
  /** 직전 판정에서 바가 보였는지 */
  wasVisible: boolean;
  /** 「통화 없음」으로 확정돼 다시 보이지 않을 callId */
  suppressed: boolean;
};

export type NativeCallBarDecision = {
  visible: boolean;
  /** true 면 이 callId 를 다시 표시하지 않고 서버 세션을 1회 확인한다 */
  suppressAndReconcile: boolean;
};

export function decideNativeCallBar(input: NativeCallBarInput): NativeCallBarDecision {
  const callId = input.storeCallId?.trim() ?? "";
  if (!input.supported || input.phase !== "connected" || !callId || input.suppressed) {
    return { visible: false, suppressAndReconcile: false };
  }
  const probe = input.probe;
  if (!probe || probe.kind === "unknown") {
    return { visible: input.wasVisible, suppressAndReconcile: false };
  }
  if (probe.kind === "active" && probe.callId === callId) {
    return { visible: true, suppressAndReconcile: false };
  }
  // 정상 응답인데 이 기기 네이티브에 같은 통화가 없음 (종료·다른 기기 수락·다른 통화)
  return { visible: false, suppressAndReconcile: true };
}

export type NativeCallBarTapFollowUp = "done" | "probe";

/** 탭 결과 — 화면 이동·재발신은 어떤 경우에도 하지 않는다. `not_shown` 일 때만 네이티브를 다시 확인한다. */
export function nativeCallBarTapFollowUp(result: NativeBringToFrontResult): NativeCallBarTapFollowUp {
  return result === "not_shown" ? "probe" : "done";
}

export function formatNativeCallBarDuration(connectedAtMs: number | null, nowMs: number): string {
  if (!connectedAtMs || !Number.isFinite(connectedAtMs) || connectedAtMs <= 0) return "00:00";
  const totalSec = Math.max(0, Math.floor((nowMs - connectedAtMs) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
