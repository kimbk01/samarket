/**
 * Global shell fetch/rerender audit — dev-only ([shell-fetch-trace], [shell-rerender-trace]).
 */

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

const renderCountsByComponent = new Map<string, number>();

export function logShellFetchTrace(args: {
  api: string;
  component: string;
  reason: string;
}): void {
  if (!isDev) return;
  console.log("[shell-fetch-trace]", {
    api: args.api,
    component: args.component,
    reason: args.reason,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    ts: Date.now(),
  });
}

export function bumpShellRerenderTrace(component: string, changedKeys?: string[]): number {
  if (!isDev) return 0;
  const renderCount = (renderCountsByComponent.get(component) ?? 0) + 1;
  renderCountsByComponent.set(component, renderCount);
  console.log("[shell-rerender-trace]", {
    component,
    renderCount,
    changedKeys: changedKeys ?? [],
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    ts: Date.now(),
  });
  return renderCount;
}

export function resetShellFetchTraceForTests(): void {
  renderCountsByComponent.clear();
}

/** owner hub badge runtime loop audit — dev-only */
export function logHubBadgeLoopTrace(args: { reason: string }): void {
  if (!isDev) return;
  console.log("[hub-badge-loop]", {
    reason: args.reason,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
    focused: typeof document !== "undefined" && typeof document.hasFocus === "function" ? document.hasFocus() : null,
    ts: Date.now(),
  });
}

export function logHubBadgeScheduleTrace(args: {
  source: string;
  skipped: boolean;
  ttlHit?: boolean;
}): void {
  if (!isDev) return;
  console.log("[hub-badge-schedule]", {
    source: args.source,
    skipped: args.skipped,
    ttlHit: args.ttlHit ?? false,
    ts: Date.now(),
  });
}

export function logHubBadgeRenderTrace(changedKeys?: string[]): number {
  if (!isDev) return 0;
  const renderCount = (renderCountsByComponent.get("owner_hub_badge_store_emit") ?? 0) + 1;
  renderCountsByComponent.set("owner_hub_badge_store_emit", renderCount);
  console.log("[hub-badge-render]", {
    renderCount,
    changedKeys: changedKeys ?? [],
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    ts: Date.now(),
  });
  return renderCount;
}

export function resetHubBadgeRenderTraceForTests(): void {
  renderCountsByComponent.delete("owner_hub_badge_store_emit");
}
