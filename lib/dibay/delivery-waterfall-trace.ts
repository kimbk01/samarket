/**
 * DIBAY delivery page — fetch·image·rerender·waterfall phase 추적 (dev-only).
 */

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

const renderCounts = new Map<string, number>();
const phaseStarts = new Map<string, number>();

export function logDeliveryFetchTrace(args: {
  api: string;
  component: string;
  reason: string;
  pathname?: string;
  aborted?: boolean;
}): void {
  if (!isDev) return;
  console.debug("[delivery-fetch-trace]", {
    api: args.api,
    component: args.component,
    reason: args.reason,
    pathname:
      args.pathname ??
      (typeof window !== "undefined" ? window.location.pathname : ""),
    aborted: args.aborted ?? false,
    ts: Date.now(),
  });
}

export function logDeliveryImageTrace(args: {
  src: string | null;
  priority: boolean;
  loading: string;
  sizes?: string | null;
  renderedWidth?: number | null;
  renderedHeight?: number | null;
  surface?: string;
}): void {
  if (!isDev) return;
  console.debug("[delivery-image-trace]", {
    src: args.src,
    priority: args.priority,
    loading: args.loading,
    sizes: args.sizes ?? null,
    renderedWidth: args.renderedWidth ?? null,
    renderedHeight: args.renderedHeight ?? null,
    surface: args.surface ?? null,
    ts: Date.now(),
  });
}

export function bumpDeliveryRerenderTrace(component: string, changedKeys?: string[]): number {
  if (!isDev) return 0;
  const next = (renderCounts.get(component) ?? 0) + 1;
  renderCounts.set(component, next);
  console.debug("[delivery-rerender-trace]", {
    component,
    renderCount: next,
    changedKeys: changedKeys ?? [],
    ts: Date.now(),
  });
  return next;
}

export function markDeliveryWaterfallPhase(phase: string): void {
  if (!isDev) return;
  phaseStarts.set(phase, Date.now());
  console.debug("[delivery-waterfall-phase]", {
    phase,
    start: phaseStarts.get(phase),
    end: null,
    duration: null,
    ts: Date.now(),
  });
}

export function endDeliveryWaterfallPhase(phase: string): void {
  if (!isDev) return;
  const start = phaseStarts.get(phase);
  const end = Date.now();
  console.debug("[delivery-waterfall-phase]", {
    phase,
    start: start ?? null,
    end,
    duration: start != null ? end - start : null,
    ts: end,
  });
  phaseStarts.delete(phase);
}

export function resetDeliveryWaterfallTraceForTests(): void {
  renderCounts.clear();
  phaseStarts.clear();
}
