"use client";

import {
  createElement,
  Profiler,
  useEffect,
  useLayoutEffect,
  useRef,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";
import { noteCmDevLongtaskDuringRoomEntry } from "@/lib/community-messenger/dev/cm-dev-noise-impact";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";
import { logMessengerPerfMeasurementGuideOnce } from "@/lib/http/perf-measurement-context";
import { scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

let longTaskObserverInstalled = false;
let microtaskInstrumentationInstalled = false;
let microtaskDepth = 0;
let microtaskPeak = 0;
let microtaskFloodLastLogAt = 0;

function readSessionFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** prod에 가깝게 dev noise 줄임 — 계측·집계 최소화 */
export function cmProdParityModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CM_PROD_PARITY_MODE === "1";
}

export function cmEventLoopDiagnosticsEnabled(): boolean {
  if (cmProdParityModeEnabled()) return false;
  if (process.env.NODE_ENV !== "development") return false;
  if (messengerVerboseTraceConsoleEnabled()) return true;
  return readSessionFlag("samarket:debug:messengerStall");
}

/** @deprecated — `cmEventLoopDiagnosticsEnabled` 와 동일 게이트 */
export function cmMainThreadDevEnabled(): boolean {
  return cmEventLoopDiagnosticsEnabled();
}

export function cmDevHmrFlags(): {
  dev_hmr_active: boolean;
  fast_refresh_pending: boolean;
  webpack_invalidating: boolean;
  hmr_pending_updates: boolean;
  vite_or_next_overlay_active: boolean;
} {
  const hot =
    typeof module !== "undefined"
      ? (module as unknown as {
          hot?: {
            status?: () => string;
            isScheduledForUpdate?: () => boolean;
          };
        }).hot
      : undefined;
  const status = hot?.status?.() ?? "";
  const overlayActive =
    typeof document !== "undefined" &&
    Boolean(
      document.querySelector("nextjs-portal") ||
        document.querySelector("[data-nextjs-dialog]") ||
        document.querySelector("#__next-build-watcher")
    );
  return {
    dev_hmr_active: Boolean(hot),
    fast_refresh_pending: Boolean(hot?.isScheduledForUpdate?.()),
    webpack_invalidating: status === "prepare" || status === "check" || status === "dispose",
    hmr_pending_updates: status === "check" || Boolean(hot?.isScheduledForUpdate?.()),
    vite_or_next_overlay_active: overlayActive,
  };
}

export function cmDevRuntimeEnvSnapshot(): {
  active_ws_count: number;
  vite_or_next_overlay_active: boolean;
  hmr_pending_updates: boolean;
} {
  const hmr = cmDevHmrFlags();
  let wsCount = 0;
  if (typeof window !== "undefined") {
    try {
      const w = window as unknown as { __SAMARKET_WS_COUNT__?: number };
      if (typeof w.__SAMARKET_WS_COUNT__ === "number") {
        wsCount = w.__SAMARKET_WS_COUNT__;
      }
    } catch {
      /* ignore */
    }
  }
  return {
    active_ws_count: wsCount,
    vite_or_next_overlay_active: hmr.vite_or_next_overlay_active,
    hmr_pending_updates: hmr.hmr_pending_updates,
  };
}

function installCmMicrotaskInstrumentation(): void {
  if (!cmEventLoopDiagnosticsEnabled() || microtaskInstrumentationInstalled || typeof window === "undefined") {
    return;
  }
  microtaskInstrumentationInstalled = true;
  const global = window as unknown as {
    queueMicrotask?: typeof queueMicrotask;
    __cmOrigQueueMicrotask?: typeof queueMicrotask;
  };
  if (!global.queueMicrotask || global.__cmOrigQueueMicrotask) return;
  const orig = global.queueMicrotask.bind(global);
  global.__cmOrigQueueMicrotask = orig;
  global.queueMicrotask = (callback: VoidFunction) => {
    microtaskDepth += 1;
    microtaskPeak = Math.max(microtaskPeak, microtaskDepth);
    orig(() => {
      try {
        callback();
      } finally {
        microtaskDepth -= 1;
        if (microtaskDepth === 0 && microtaskPeak >= 24) {
          const now = Date.now();
          if (now - microtaskFloodLastLogAt > 800) {
            microtaskFloodLastLogAt = now;
            // eslint-disable-next-line no-console -- gated diagnostics
            console.warn("[cm-microtask-flood]", {
              peak_depth: microtaskPeak,
              ...cmDevRuntimeEnvSnapshot(),
            });
          }
          microtaskPeak = 0;
        }
      }
    });
  };
}

function ensureCmLongTaskObserver(): void {
  if (!cmEventLoopDiagnosticsEnabled() || longTaskObserverInstalled || typeof PerformanceObserver === "undefined") {
    return;
  }
  installCmMicrotaskInstrumentation();
  longTaskObserverInstalled = true;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 50) continue;
        const duration = Math.round(entry.duration);
        const startTime = Math.round(entry.startTime);
        noteCmDevLongtaskDuringRoomEntry(duration, startTime);
        const base = { duration, startTime, ...cmDevRuntimeEnvSnapshot() };
        if (duration >= 200) {
          const attr = (
            entry as PerformanceEntry & {
              attribution?: Array<{ name?: string; containerType?: string; containerSrc?: string }>;
            }
          ).attribution?.[0];
          // eslint-disable-next-line no-console -- severe stall diagnostics
          console.warn("[cm-longtask-severe]", {
            ...base,
            taskType: attr?.containerType ?? null,
            scriptUrl: attr?.name ?? attr?.containerSrc ?? null,
          });
        } else {
          // eslint-disable-next-line no-console -- gated stall diagnostics
          console.warn("[cm-longtask]", base);
        }
      }
    });
    obs.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
  } catch {
    /* ignore */
  }
}

function markName(kind: string, roomId: string): string {
  return `cm-${kind}:${roomId.slice(-12)}`;
}

export function cmMarkBootstrapTrigger(roomId: string): void {
  if (typeof performance === "undefined") return;
  performance.mark(markName("bootstrap-trigger", roomId));
}

export function cmMarkBootstrapFetchStart(roomId: string): void {
  if (typeof performance === "undefined") return;
  const trigger = markName("bootstrap-trigger", roomId);
  const start = markName("bootstrap-fetch-start", roomId);
  performance.mark(start);
  try {
    const triggerEntry = performance.getEntriesByName(trigger, "mark").pop();
    if (triggerEntry) {
      const gapMs = Math.round(performance.now() - triggerEntry.startTime);
      if (cmEventLoopDiagnosticsEnabled() && gapMs >= 8) {
        // eslint-disable-next-line no-console -- schedule gap diagnostics
        console.log("[cm-bootstrap-schedule-gap]", {
          roomIdSuffix: roomId.slice(-8),
          gap_ms: gapMs,
          ...cmDevRuntimeEnvSnapshot(),
          ...cmDevHmrFlags(),
        });
      }
    }
  } catch {
    /* ignore */
  }
}

export function cmMarkBootstrapFetchAwait(roomId: string): void {
  if (typeof performance === "undefined") return;
  performance.mark(markName("bootstrap-fetch-await", roomId));
}

export function cmMarkBootstrapFetchResolve(roomId: string): void {
  if (typeof performance === "undefined") return;
  performance.mark(markName("bootstrap-fetch-resolve", roomId));
  if (!cmEventLoopDiagnosticsEnabled()) return;
  try {
    const measure = `cm-bootstrap-fetch-headers:${roomId.slice(-12)}`;
    performance.measure(
      measure,
      markName("bootstrap-fetch-await", roomId),
      markName("bootstrap-fetch-resolve", roomId)
    );
    const m = performance.getEntriesByName(measure, "measure").pop();
    if (m && m.duration >= 16) {
      // eslint-disable-next-line no-console -- gated
      console.log("[cm-bootstrap-fetch-wire]", {
        roomIdSuffix: roomId.slice(-8),
        headers_ms: Math.round(m.duration),
      });
    }
    performance.clearMeasures(measure);
  } catch {
    /* ignore */
  }
}

/** @deprecated */
export function cmDevMarkBootstrapFetchScheduled(roomId: string): void {
  cmMarkBootstrapTrigger(roomId);
}

/** @deprecated */
export function cmDevMarkBootstrapFetchStart(roomId: string): void {
  cmMarkBootstrapFetchStart(roomId);
}

export type CmBootstrapFetchPriority = "high" | "idle";

export function resolveCmRoomBootstrapFetchPriority(args: {
  silent: boolean;
  shouldBlock: boolean;
  forceSilentNetwork?: boolean;
  loaded: boolean;
}): CmBootstrapFetchPriority {
  if (args.shouldBlock) return "high";
  if (!args.silent) return "high";
  if (args.forceSilentNetwork) return "high";
  if (!args.loaded) return "high";
  return "idle";
}

export function runCmBootstrapNetworkWork(
  priority: CmBootstrapFetchPriority,
  run: () => void | Promise<void>
): void {
  if (priority === "high") {
    void run();
    return;
  }
  scheduleWhenBrowserIdle(() => {
    void run();
  }, 480);
}

export function useCmDevRenderTrace(componentName: string): void {
  const enabled = cmEventLoopDiagnosticsEnabled();
  if (enabled) {
    ensureCmLongTaskObserver();
    logMessengerPerfMeasurementGuideOnce();
    // eslint-disable-next-line no-console -- gated render storm diagnostics
    console.count(`[cm-render] ${componentName}`);
  }

  const startRef = useRef(0);
  const renderPassRef = useRef(0);
  renderPassRef.current += 1;
  if (enabled && renderPassRef.current === 2) {
    // eslint-disable-next-line no-console -- StrictMode dev probe
    console.debug("[cm-strict]", { strict_render_double_invoke_detected: true, component: componentName });
  }

  if (enabled && typeof performance !== "undefined") {
    startRef.current = performance.now();
    performance.mark(`cm-render-start:${componentName}`);
  }

  useLayoutEffect(() => {
    if (!enabled || typeof performance === "undefined") return;
    const endMark = `cm-render-end:${componentName}`;
    const measureName = `cm-render-wall:${componentName}`;
    performance.mark(endMark);
    try {
      performance.measure(measureName, `cm-render-start:${componentName}`, endMark);
      const m = performance.getEntriesByName(measureName, "measure").pop();
      if (m && m.duration >= 8) {
        // eslint-disable-next-line no-console -- gated render wall diagnostics
        console.log("[cm-render-wall]", { component: componentName, wall_ms: Math.round(m.duration) });
      }
    } catch {
      const wallMs = Math.round(performance.now() - startRef.current);
      if (wallMs >= 8) {
        // eslint-disable-next-line no-console -- gated render wall diagnostics
        console.log("[cm-render-wall]", { component: componentName, wall_ms: wallMs });
      }
    } finally {
      performance.clearMeasures(measureName);
      performance.clearMarks(`cm-render-start:${componentName}`);
      performance.clearMarks(endMark);
    }
  });
}

export function useCmStrictModeEffectProbe(label: string): void {
  const enabled = cmEventLoopDiagnosticsEnabled();
  const sawCleanupRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (sawCleanupRef.current) {
      // eslint-disable-next-line no-console -- StrictMode dev probe
      console.debug("[cm-strict]", { strict_effect_double_run_detected: true, label });
    }
    return () => {
      sawCleanupRef.current = true;
    };
  });
}

const onCmReactCommit: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  _baseDuration,
  startTime,
  commitTime
) => {
  if (!cmEventLoopDiagnosticsEnabled()) return;
  if (phase !== "mount" && phase !== "update") return;
  const commitMs = Math.round(commitTime - startTime);
  const renderMs = Math.round(actualDuration);
  if (commitMs < 6 && renderMs < 6) return;
  // eslint-disable-next-line no-console -- React commit probe
  console.log("[cm-react-commit]", { id, phase, commit_ms: commitMs, render_ms: renderMs });
};

export function CmReactCommitProbe({ id, children }: { id: string; children: ReactNode }): ReactNode {
  if (!cmEventLoopDiagnosticsEnabled()) return children;
  return createElement(Profiler, { id, onRender: onCmReactCommit }, children);
}
