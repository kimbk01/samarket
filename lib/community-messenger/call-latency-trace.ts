"use client";

/** P1-1 — 발신 지연 최소 계측 (prod 포함, 4종만) */

let dialClickPerfMs = 0;

export function markCallLatencyDialClickAnchor(): void {
  if (typeof performance !== "undefined") {
    dialClickPerfMs = performance.now();
  }
}

function sinceDialClickMs(): number | undefined {
  if (typeof performance === "undefined" || dialClickPerfMs <= 0) return undefined;
  return Math.round(performance.now() - dialClickPerfMs);
}

export function logCallLatencyDialClick(extra: Record<string, unknown> = {}): void {
  markCallLatencyDialClickAnchor();
  console.info("[call-latency] dial_click", {
    at: Date.now(),
    sinceClick: 0,
    ...extra,
  });
}

export function logCallLatencyRouteReplace(extra: Record<string, unknown> = {}): void {
  console.info("[call-latency] route_replace", {
    at: Date.now(),
    sinceClick: sinceDialClickMs(),
    ...extra,
  });
}

export function logCallLatencyCallScreenPainted(extra: Record<string, unknown> = {}): void {
  console.info("[call-latency] call_screen_painted", {
    at: Date.now(),
    sinceClick: sinceDialClickMs(),
    ...extra,
  });
}

export function logCallMediaOutgoingVideoGumDeferred(extra: Record<string, unknown> = {}): void {
  console.info("[call-media] outgoing_video_gum_deferred", {
    at: Date.now(),
    sinceClick: sinceDialClickMs(),
    ...extra,
  });
}
