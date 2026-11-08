/**
 * D2 실시간 연결 끊김 이유 진단 — 연결 상태 알림에 **기록 함수만** 붙인다(연결·재시도·심장박동 동작 무변경).
 * 설계: docs/audit/realtime-connection-drop-diagnostics-design-2026-11-09.md
 *
 * - `lib/supabase/client.ts`(Auth HARD LOCK)는 수정하지 않는다. 라이브러리 공개 함수 `realtime.onHeartbeat` 와
 *   연결 상태 알림 목록(`realtime.stateChangeCallbacks`)에만 붙는다. 토큰은 만료 시각만 읽는다.
 * - 라이브러리가 두 콜백 모두 try/catch 로 실행하고, 여기서도 모든 처리를 try/catch 로 감싼다.
 * - 이상 상황만 기록(정상 심장박동 제외) → U1 전송 상한을 차지하지 않는다.
 */

import {
  REALTIME_CONNECTION_CATEGORY,
  REALTIME_HEARTBEAT_SLOW_MS,
  closeCodeBucket,
  realtimeConnectionMetric,
  tokenBucket,
  visibilityBucket,
} from "./realtime-connection-rollup-key";

type RealtimeLike = {
  onHeartbeat?: (cb: (status: string, latencyMs?: number) => void) => void;
  stateChangeCallbacks?: { open?: unknown; close?: unknown; error?: unknown };
  accessTokenValue?: unknown;
};

type RecordFn = (e: {
  category: typeof REALTIME_CONNECTION_CATEGORY;
  metric: string;
  value?: number;
  unit: "ms" | "count";
}) => void;

let installedOn: object | null = null;

function currentVisibility() {
  return visibilityBucket(typeof document !== "undefined" ? document.visibilityState : "visible");
}

/** 테스트용 */
export function __resetRealtimeConnectionMonitorForTests(): void {
  installedOn = null;
}

/**
 * 실시간 클라이언트에 1회만 설치한다. 같은 클라이언트에 다시 불러도 아무것도 하지 않는다.
 * @returns 이번 호출로 설치했으면 true
 */
export function installRealtimeConnectionMonitor(realtime: unknown, record: RecordFn, now: () => number = Date.now): boolean {
  try {
    if (!realtime || typeof realtime !== "object") return false;
    if (installedOn === realtime) return false;
    const rt = realtime as RealtimeLike;
    if (typeof rt.onHeartbeat !== "function") return false;
    installedOn = realtime;

    let closedAt: number | null = null;
    const emit = (metric: string, value?: number, unit: "ms" | "count" = "count") => {
      try {
        record({ category: REALTIME_CONNECTION_CATEGORY, metric, unit, ...(typeof value === "number" ? { value } : {}) });
      } catch {
        /* 기록 실패는 연결에 영향 없음 */
      }
    };
    const tok = () => tokenBucket(rt.accessTokenValue, now());

    rt.onHeartbeat((status, latencyMs) => {
      try {
        if (status === "timeout") {
          emit(realtimeConnectionMetric.heartbeatTimeout(currentVisibility(), tok()));
        } else if (status === "ok" && typeof latencyMs === "number" && latencyMs >= REALTIME_HEARTBEAT_SLOW_MS) {
          emit(realtimeConnectionMetric.heartbeatSlow(currentVisibility()), Math.round(latencyMs), "ms");
        }
      } catch {
        /* ignore */
      }
    });

    const cbs = rt.stateChangeCallbacks;
    if (cbs && Array.isArray(cbs.close)) {
      cbs.close.push((event: unknown) => {
        try {
          const code = event && typeof event === "object" ? (event as { code?: unknown }).code : undefined;
          closedAt = now();
          emit(realtimeConnectionMetric.socketClose(closeCodeBucket(code), currentVisibility(), tok()));
        } catch {
          /* ignore */
        }
      });
    }
    if (cbs && Array.isArray(cbs.error)) {
      cbs.error.push(() => {
        try {
          emit(realtimeConnectionMetric.socketError(currentVisibility(), tok()));
        } catch {
          /* ignore */
        }
      });
    }
    if (cbs && Array.isArray(cbs.open)) {
      cbs.open.push(() => {
        try {
          if (closedAt == null) return;
          const downMs = Math.max(0, now() - closedAt);
          closedAt = null;
          emit(realtimeConnectionMetric.socketReopen(currentVisibility()), downMs, "ms");
        } catch {
          /* ignore */
        }
      });
    }
    return true;
  } catch {
    return false;
  }
}
