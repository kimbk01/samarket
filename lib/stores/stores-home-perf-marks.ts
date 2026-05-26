"use client";

/** `/stores` 홈 — idle·백그라운드 prewarm/portal 최소 지연 (체감 우선) */
export const STORES_HOME_IDLE_DEFER_MS = 5000;

export type StoresHomePerfStage =
  | "shell"
  | "hero"
  | "category"
  | "store-card"
  | "scroll-ready";

declare global {
  interface Window {
    __storesHomePerf?: Partial<Record<StoresHomePerfStage, number>>;
    __storesPerfLongTasks?: Array<{ start: number; duration: number }>;
    __storesPerfLcpMs?: number | null;
  }
}

export function markStoresHomePerf(stage: StoresHomePerfStage): void {
  if (typeof performance === "undefined") return;
  const name = `stores-home:${stage}`;
  try {
    performance.mark(name);
  } catch {
    /* duplicate mark — ignore */
  }
  if (typeof window !== "undefined") {
    const t = performance.now();
    window.__storesHomePerf = { ...window.__storesHomePerf, [stage]: t };
  }
}

export function installStoresHomePerfObservers(): void {
  if (typeof window === "undefined") return;
  if ((window as Window & { __storesPerfObserversInstalled?: boolean }).__storesPerfObserversInstalled) {
    return;
  }
  (window as Window & { __storesPerfObserversInstalled?: boolean }).__storesPerfObserversInstalled = true;
  window.__storesPerfLongTasks = [];
  window.__storesPerfLcpMs = null;

  if ("PerformanceObserver" in window) {
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__storesPerfLcpMs = last.startTime;
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
    } catch {
      /* LCP unsupported */
    }
    try {
      const ltObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < 50) continue;
          window.__storesPerfLongTasks!.push({ start: e.startTime, duration: e.duration });
        }
      });
      ltObs.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
    } catch {
      /* longtask unsupported */
    }
  }
}
