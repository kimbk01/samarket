"use client";

/** P1-1 + P1-6 — 발신·재발신 지연 계측 (prod logcat·WebView console) */

const POST_TERMINAL_DIAL_PATH_WINDOW_MS = 120_000;

let dialClickPerfMs = 0;
let routeReplacePerfMs = 0;
let sessionCreatedPerfMs = 0;
let mediaCleanupStartPerfMs = 0;
let dialClickCount = 0;
let lastTerminalCleanupDoneAtMs = 0;

export type CallLatencyDialPath = "cold" | "warm" | "post_terminal";

/** unit test — 모듈 상태 초기화 */
export function resetCallLatencyTraceStateForTests(): void {
  dialClickPerfMs = 0;
  routeReplacePerfMs = 0;
  sessionCreatedPerfMs = 0;
  mediaCleanupStartPerfMs = 0;
  dialClickCount = 0;
  lastTerminalCleanupDoneAtMs = 0;
}

export function markCallLatencyDialClickAnchor(): void {
  if (typeof performance !== "undefined") {
    dialClickPerfMs = performance.now();
  }
}

function sinceDialClickMs(): number | undefined {
  if (typeof performance === "undefined" || dialClickPerfMs <= 0) return undefined;
  return Math.round(performance.now() - dialClickPerfMs);
}

function sinceRouteReplaceMs(): number | undefined {
  if (typeof performance === "undefined" || routeReplacePerfMs <= 0) return undefined;
  return Math.round(performance.now() - routeReplacePerfMs);
}

function sinceSessionCreatedMs(): number | undefined {
  if (typeof performance === "undefined" || sessionCreatedPerfMs <= 0) return undefined;
  return Math.round(performance.now() - sessionCreatedPerfMs);
}

function sinceTerminalCleanupMs(): number | undefined {
  if (lastTerminalCleanupDoneAtMs <= 0) return undefined;
  return Date.now() - lastTerminalCleanupDoneAtMs;
}

function resolveDialPath(): CallLatencyDialPath {
  const sinceTerminal = sinceTerminalCleanupMs();
  if (
    sinceTerminal !== undefined &&
    sinceTerminal >= 0 &&
    sinceTerminal <= POST_TERMINAL_DIAL_PATH_WINDOW_MS
  ) {
    return "post_terminal";
  }
  if (dialClickCount <= 1) return "cold";
  return "warm";
}

function latencyPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const sinceClick = sinceDialClickMs();
  const sinceRouteReplace = sinceRouteReplaceMs();
  const sinceSessionCreated = sinceSessionCreatedMs();
  const sinceTerminalCleanup = sinceTerminalCleanupMs();
  return {
    at: Date.now(),
    ...(sinceClick !== undefined ? { sinceClick } : {}),
    ...(sinceRouteReplace !== undefined ? { sinceRouteReplace } : {}),
    ...(sinceSessionCreated !== undefined ? { sinceSessionCreated } : {}),
    ...(sinceTerminalCleanup !== undefined ? { sinceTerminalCleanup } : {}),
    ...extra,
  };
}

export function logCallLatencyDialClick(extra: Record<string, unknown> = {}): void {
  dialClickCount += 1;
  markCallLatencyDialClickAnchor();
  const dialPath = resolveDialPath();
  console.info("[call-latency] dial_click", {
    ...latencyPayload({ sinceClick: 0, sinceRouteReplace: undefined, sinceSessionCreated: undefined }),
    dial_path: dialPath,
    dialClickIndex: dialClickCount,
    ...extra,
  });
}

export function logCallLatencyRouteReplace(extra: Record<string, unknown> = {}): void {
  if (typeof performance !== "undefined") {
    routeReplacePerfMs = performance.now();
  }
  console.info("[call-latency] route_replace", latencyPayload(extra));
}

export function logCallLatencyCallScreenPainted(extra: Record<string, unknown> = {}): void {
  console.info("[call-latency] call_screen_painted", latencyPayload(extra));
}

export function logCallLatencySessionCreated(extra: Record<string, unknown> = {}): void {
  if (typeof performance !== "undefined") {
    sessionCreatedPerfMs = performance.now();
  }
  console.info("[call-latency] session_created", latencyPayload(extra));
}

export function logCallLatencyCmInviteRingEmit(extra: Record<string, unknown> = {}): void {
  console.info(
    "[call-latency] cm_invite_ring",
    latencyPayload({ role: "initiator", phase: "emit", ...extra })
  );
}

export function logCallLatencyCmInviteRingReceived(extra: Record<string, unknown> = {}): void {
  console.info(
    "[call-latency] cm_invite_ring",
    latencyPayload({ role: "recipient", phase: "received", ...extra })
  );
}

export function logCallLatencyTerminalCleanupDone(extra: Record<string, unknown> = {}): void {
  lastTerminalCleanupDoneAtMs = Date.now();
  console.info("[call-latency] terminal_cleanup_done", {
    at: lastTerminalCleanupDoneAtMs,
    ...extra,
  });
}

export function logCallLatencyMediaCleanupStart(extra: Record<string, unknown> = {}): void {
  if (typeof performance !== "undefined") {
    mediaCleanupStartPerfMs = performance.now();
  }
  console.info("[call-latency] media_cleanup_start", latencyPayload(extra));
}

export function logCallLatencyMediaCleanupDone(extra: Record<string, unknown> = {}): void {
  const sinceCleanupStart =
    typeof performance !== "undefined" && mediaCleanupStartPerfMs > 0
      ? Math.round(performance.now() - mediaCleanupStartPerfMs)
      : undefined;
  console.info(
    "[call-latency] media_cleanup_done",
    latencyPayload({
      ...(sinceCleanupStart !== undefined ? { sinceCleanupStart } : {}),
      ...extra,
    })
  );
  mediaCleanupStartPerfMs = 0;
}

export function logCallMediaOutgoingVideoGumDeferred(extra: Record<string, unknown> = {}): void {
  console.info("[call-media] outgoing_video_gum_deferred", latencyPayload(extra));
}
