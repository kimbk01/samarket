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
import { communityMessengerBootstrapDisplayEqual } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
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

const cmMemoDiffLastLogAt = new Map<string, number>();

/** React.memo propsEqual 실패 시 prop 이름 단위 진단 (dev·verbose 게이트) */
export function logCmMemoPropDiff(component: string, entityId: string | null, reasons: string[]): void {
  if (!cmEventLoopDiagnosticsEnabled() || reasons.length === 0) return;
  const key = `${component}:${entityId ?? "global"}`;
  const now = Date.now();
  if (now - (cmMemoDiffLastLogAt.get(key) ?? 0) < 280) return;
  cmMemoDiffLastLogAt.set(key, now);
  // eslint-disable-next-line no-console -- gated memo diagnostics
  console.debug("[cm-memo-diff]", {
    component,
    entityIdSuffix: entityId ? entityId.slice(-8) : null,
    reasons,
    memo_equal: false,
  });
}

export type CmHomeSetDataSource =
  | "home-sync"
  | "realtime-message"
  | "unread-delta"
  | "presence"
  | "trade-meta"
  | "bus"
  | "deferred-calls"
  | "bootstrap"
  | "mark-read"
  | "optimistic-read"
  | "multi-tab";

export type CmHomeSetDataLogContext = {
  reason?: string;
  roomId?: string;
  changedRoomCount?: number;
  criticalChangedFields?: Record<string, string[]>;
};

const cmHomeSetDataLogLastAt = new Map<string, number>();

function diffHomeSyncBootstrapListOrderFields(
  prev: CommunityMessengerBootstrap,
  next: CommunityMessengerBootstrap
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const diffBucket = (label: "chats" | "groups") => {
    const aa = prev[label] ?? [];
    const bb = next[label] ?? [];
    if (aa.length !== bb.length) {
      out[`${label}:length`] = [`${aa.length}->${bb.length}`];
    }
    const max = Math.max(aa.length, bb.length);
    for (let i = 0; i < max; i++) {
      const a = aa[i];
      const b = bb[i];
      if (!a || !b) {
        out[`${label}:${i}`] = ["missing_row"];
        continue;
      }
      if (a.id !== b.id) {
        out[`${label}:${i}`] = [`order:${a.id.slice(-8)}->${b.id.slice(-8)}`];
      }
    }
  };
  diffBucket("chats");
  diffBucket("groups");
  if (Object.keys(out).length === 0) out.bootstrap = ["display_diff_unresolved"];
  return out;
}

function logCmHomeSetDataOutcome(
  source: CmHomeSetDataSource,
  changed: boolean,
  reason: string,
  context?: Pick<CmHomeSetDataLogContext, "roomId" | "changedRoomCount" | "criticalChangedFields">
): void {
  if (!cmEventLoopDiagnosticsEnabled()) return;
  const roomId = context?.roomId;
  const throttleKey = `${changed ? "applied" : "skip"}:${source}:${reason}:${roomId ?? ""}`;
  const now = Date.now();
  const throttleMs = changed ? 120 : 400;
  if (now - (cmHomeSetDataLogLastAt.get(throttleKey) ?? 0) < throttleMs) return;
  cmHomeSetDataLogLastAt.set(throttleKey, now);
  const payload = {
    source,
    changed,
    reason,
    ...(roomId ? { roomId } : {}),
    ...(context?.changedRoomCount != null ? { changedRoomCount: context.changedRoomCount } : {}),
    ...(context?.criticalChangedFields && Object.keys(context.criticalChangedFields).length > 0
      ? { criticalChangedFields: context.criticalChangedFields }
      : {}),
  };
  // eslint-disable-next-line no-console -- gated setData diagnostics
  console.debug("[setData]", payload);
  if (!changed) {
    // eslint-disable-next-line no-console -- gated setData diagnostics
    console.debug("[setData skipped: same data]", payload);
  }
}

/** patch·bootstrap merge 후 React state commit — 동일 내용이면 `prev` 반환 */
export function resolveMessengerHomeBootstrapSetData(
  source: CmHomeSetDataSource,
  prev: CommunityMessengerBootstrap | null,
  next: CommunityMessengerBootstrap | null,
  context?: CmHomeSetDataLogContext
): CommunityMessengerBootstrap | null {
  if (next == null) return next;
  const reasonBase = context?.reason ?? "bootstrap_patch";
  const logContext = {
    roomId: context?.roomId,
    changedRoomCount: context?.changedRoomCount,
    criticalChangedFields: context?.criticalChangedFields,
  };
  if (next === prev) {
    logCmHomeSetDataOutcome(source, false, `${reasonBase}:same_reference`, logContext);
    return prev;
  }
  if (prev && communityMessengerBootstrapDisplayEqual(prev, next)) {
    logCmHomeSetDataOutcome(source, false, `${reasonBase}:display_equal`, logContext);
    return prev;
  }
  const appliedLogContext = {
    ...logContext,
    changedRoomCount: logContext.changedRoomCount ?? 0,
    ...(logContext.criticalChangedFields && Object.keys(logContext.criticalChangedFields).length > 0
      ? {}
      : source === "home-sync" && prev
        ? { criticalChangedFields: diffHomeSyncBootstrapListOrderFields(prev, next) }
        : {}),
  };
  logCmHomeSetDataOutcome(source, true, reasonBase, appliedLogContext);
  return next;
}

/** memo skip 확인용 — 동일 엔티티당 8초에 1회 */
export function logCmMemoPropEqual(component: string, entityId: string | null): void {
  if (!cmEventLoopDiagnosticsEnabled()) return;
  const key = `${component}:eq:${entityId ?? "global"}`;
  const now = Date.now();
  if (now - (cmMemoDiffLastLogAt.get(key) ?? 0) < 8000) return;
  cmMemoDiffLastLogAt.set(key, now);
  // eslint-disable-next-line no-console -- gated memo diagnostics
  console.debug("[cm-memo-diff]", {
    component,
    entityIdSuffix: entityId ? entityId.slice(-8) : null,
    memo_equal: true,
  });
}

export type CmHomeRenderSourceProbeInput = {
  pathname: string;
  searchQueryString: string;
  language: string;
  philifeHeaderStackIsOpen: boolean;
  loading: boolean;
  listAwaitingCritical: boolean;
  homeRealtimeGateOpen: boolean;
  notificationSettingsLoaded: boolean;
  data: unknown;
};

type CmHomeRenderSourceCategory =
  | "router"
  | "bootstrap"
  | "i18n"
  | "philife"
  | "data"
  | "unknown-parent-or-context";

const cmHomeRenderSourceAgg = {
  totalComparedRenders: 0,
  router: 0,
  bootstrap: 0,
  i18n: 0,
  philife: 0,
  data: 0,
  unknown: 0,
  summaryTimerId: null as ReturnType<typeof setTimeout> | null,
};

function bumpCmHomeRenderSourceCategories(reasons: CmHomeRenderSourceCategory[]): void {
  cmHomeRenderSourceAgg.totalComparedRenders += 1;
  for (const category of reasons) {
    if (category === "router") cmHomeRenderSourceAgg.router += 1;
    else if (category === "bootstrap") cmHomeRenderSourceAgg.bootstrap += 1;
    else if (category === "i18n") cmHomeRenderSourceAgg.i18n += 1;
    else if (category === "philife") cmHomeRenderSourceAgg.philife += 1;
    else if (category === "data") cmHomeRenderSourceAgg.data += 1;
    else cmHomeRenderSourceAgg.unknown += 1;
  }
}

function resolveCmHomeTopRenderSource(): string {
  const entries: Array<[CmHomeRenderSourceCategory, number]> = [
    ["router", cmHomeRenderSourceAgg.router],
    ["bootstrap", cmHomeRenderSourceAgg.bootstrap],
    ["i18n", cmHomeRenderSourceAgg.i18n],
    ["philife", cmHomeRenderSourceAgg.philife],
    ["data", cmHomeRenderSourceAgg.data],
    ["unknown-parent-or-context", cmHomeRenderSourceAgg.unknown],
  ];
  const max = Math.max(...entries.map(([, count]) => count));
  if (max === 0) return "none";
  return entries
    .filter(([, count]) => count === max)
    .map(([category]) => category)
    .join("+");
}

function logCmHomeRenderSourceSummary(): void {
  // eslint-disable-next-line no-console -- gated 30s idle aggregation
  console.info("[cm-render-source-summary]", {
    component: "CommunityMessengerHome",
    window_ms: 30000,
    total_compared_renders: cmHomeRenderSourceAgg.totalComparedRenders,
    top_render_source: resolveCmHomeTopRenderSource(),
    router_changed_count: cmHomeRenderSourceAgg.router,
    bootstrap_local_state_changed_count: cmHomeRenderSourceAgg.bootstrap,
    i18n_changed_count: cmHomeRenderSourceAgg.i18n,
    philife_context_changed_count: cmHomeRenderSourceAgg.philife,
    data_ref_changed_count: cmHomeRenderSourceAgg.data,
    unknown_count: cmHomeRenderSourceAgg.unknown,
  });
}

function scheduleCmHomeRenderSourceSummaryOnce(): void {
  if (cmHomeRenderSourceAgg.summaryTimerId != null) return;
  cmHomeRenderSourceAgg.summaryTimerId = setTimeout(() => {
    cmHomeRenderSourceAgg.summaryTimerId = null;
    logCmHomeRenderSourceSummary();
  }, 30000);
}

/** CommunityMessengerHome 렌더 원인 probe — dev·sessionStorage 게이트 */
export function useCmHomeRenderSourceProbe(input: CmHomeRenderSourceProbeInput): void {
  const enabled = cmEventLoopDiagnosticsEnabled();
  const prevRef = useRef<CmHomeRenderSourceProbeInput | null>(null);

  if (!enabled) {
    prevRef.current = input;
    return;
  }

  ensureCmLongTaskObserver();
  scheduleCmHomeRenderSourceSummaryOnce();

  const prev = prevRef.current;
  if (prev) {
    const fieldDiff: Record<string, { prev: unknown; next: unknown }> = {};
    const reasons: CmHomeRenderSourceCategory[] = [];

    if (prev.pathname !== input.pathname) {
      fieldDiff.pathname = { prev: prev.pathname, next: input.pathname };
    }
    if (prev.searchQueryString !== input.searchQueryString) {
      fieldDiff.searchQueryString = { prev: prev.searchQueryString, next: input.searchQueryString };
    }
    if (prev.pathname !== input.pathname || prev.searchQueryString !== input.searchQueryString) {
      reasons.push("router");
    }

    if (prev.language !== input.language) {
      fieldDiff.language = { prev: prev.language, next: input.language };
      reasons.push("i18n");
    }

    if (prev.philifeHeaderStackIsOpen !== input.philifeHeaderStackIsOpen) {
      fieldDiff.philifeHeaderStackIsOpen = {
        prev: prev.philifeHeaderStackIsOpen,
        next: input.philifeHeaderStackIsOpen,
      };
      reasons.push("philife");
    }

    const bootstrapChanged =
      prev.loading !== input.loading ||
      prev.listAwaitingCritical !== input.listAwaitingCritical ||
      prev.homeRealtimeGateOpen !== input.homeRealtimeGateOpen ||
      prev.notificationSettingsLoaded !== input.notificationSettingsLoaded;
    if (bootstrapChanged) {
      if (prev.loading !== input.loading) {
        fieldDiff.loading = { prev: prev.loading, next: input.loading };
      }
      if (prev.listAwaitingCritical !== input.listAwaitingCritical) {
        fieldDiff.listAwaitingCritical = {
          prev: prev.listAwaitingCritical,
          next: input.listAwaitingCritical,
        };
      }
      if (prev.homeRealtimeGateOpen !== input.homeRealtimeGateOpen) {
        fieldDiff.homeRealtimeGateOpen = {
          prev: prev.homeRealtimeGateOpen,
          next: input.homeRealtimeGateOpen,
        };
      }
      if (prev.notificationSettingsLoaded !== input.notificationSettingsLoaded) {
        fieldDiff.notificationSettingsLoaded = {
          prev: prev.notificationSettingsLoaded,
          next: input.notificationSettingsLoaded,
        };
      }
      reasons.push("bootstrap");
    }

    if (prev.data !== input.data) {
      fieldDiff.dataRefChanged = {
        prev: prev.data == null ? null : "ref",
        next: input.data == null ? null : "ref",
      };
      reasons.push("data");
    }

    if (reasons.length === 0) {
      reasons.push("unknown-parent-or-context");
    }

    bumpCmHomeRenderSourceCategories(reasons);

    // eslint-disable-next-line no-console -- gated render-source diagnostics
    console.debug("[cm-render-source]", {
      component: "CommunityMessengerHome",
      reasons,
      reason:
        reasons.length === 1 && reasons[0] === "unknown-parent-or-context"
          ? "unknown-parent-or-context"
          : reasons.join("+"),
      fieldDiff: Object.keys(fieldDiff).length > 0 ? fieldDiff : undefined,
      snapshot: {
        pathname: input.pathname,
        searchQueryString: input.searchQueryString,
        language: input.language,
        philifeHeaderStackIsOpen: input.philifeHeaderStackIsOpen,
        loading: input.loading,
        listAwaitingCritical: input.listAwaitingCritical,
        homeRealtimeGateOpen: input.homeRealtimeGateOpen,
        notificationSettingsLoaded: input.notificationSettingsLoaded,
        dataRefChanged: prev.data !== input.data,
      },
    });
  }

  prevRef.current = {
    pathname: input.pathname,
    searchQueryString: input.searchQueryString,
    language: input.language,
    philifeHeaderStackIsOpen: input.philifeHeaderStackIsOpen,
    loading: input.loading,
    listAwaitingCritical: input.listAwaitingCritical,
    homeRealtimeGateOpen: input.homeRealtimeGateOpen,
    notificationSettingsLoaded: input.notificationSettingsLoaded,
    data: input.data,
  };
}
