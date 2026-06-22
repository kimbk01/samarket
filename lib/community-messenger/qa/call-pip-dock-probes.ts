/**
 * Call PiP/Dock QA probes — SSOT + DOM (Vitest·Playwright·CDP 공용).
 * accept/join/end/Agora lifecycle 비침 — presentation 관측만.
 */

import { resolveCallPresentationSurface } from "@/lib/community-messenger/call-presentation-surface";
import { shouldUseAndroidOsPipSafeLayout } from "@/lib/community-messenger/call-android-os-pip-layout";
import {
  assertPresentationSurfaceExclusive,
  getCallDockPresentationState,
  shouldShowCallDockLayer,
  shouldSuppressCallOverlayToasts,
} from "@/lib/community-messenger/call-dock-presentation";
import { CALL_DOCK_HORIZONTAL_INSET_PX, CALL_DOCK_LAYER_Z_INDEX } from "@/lib/community-messenger/call-ui/call-dock-theme";
import type { CallPresentationSurface } from "@/lib/community-messenger/call-presentation-surface";

export const CALL_DOCK_LAYER_SELECTOR = "[data-call-dock-layer]";
export const ANDROID_OS_PIP_SAFE_SELECTOR = "[data-call-android-os-pip-safe]";
export const CALL_VIDEO_PROBE_SELECTOR = "[data-call-screen-shell] video, [data-call-android-os-pip-safe] video";

export type CallPipDockRectProbe = {
  top: number;
  left: number;
  width: number;
  height: number;
  zIndex: number;
};

export type CallPipDockScenarioVerdict = {
  scenario: string;
  iterations: number;
  pass: number;
  fail: number;
  maxPositionDeltaPx: number;
  videoRecreateCount: number;
  failures: string[];
};

export type CallPipDockProbeSnapshot = {
  at: number;
  sessionId: string | null;
  surface: CallPresentationSurface;
  androidOsPipSafeMode: boolean;
  dockLayerVisible: boolean;
  overlayToastSuppressed: boolean;
  dockPresentationPhase: string;
  presentationMutualExclusive: boolean;
  dockRect: CallPipDockRectProbe | null;
  videoElementId: string | null;
};

/** SSOT — session surface */
export function readCallPresentationSurfaceProbe(sessionId: string): CallPresentationSurface {
  return resolveCallPresentationSurface(sessionId.trim());
}

/** SSOT — ANDROID_OS_PIP safe layout */
export function readAndroidOsPipSafeModeProbe(sessionId: string): boolean {
  return shouldUseAndroidOsPipSafeLayout(sessionId);
}

/** SSOT — Dock layer chrome gate */
export function readCallDockLayerGateProbe(): boolean {
  return shouldShowCallDockLayer();
}

/** SSOT — snackbar/toast suppress */
export function readCallOverlaySuppressProbe(): boolean {
  return shouldSuppressCallOverlayToasts();
}

/** SSOT — ANDROID_OS_PIP ↔ DOCK 상호배타 */
export function readPresentationMutualExclusiveProbe(surface: CallPresentationSurface): boolean {
  return assertPresentationSurfaceExclusive(surface);
}

export function readDockPresentationPhaseProbe(): string {
  return getCallDockPresentationState().visualPhase;
}

export function compareRectTopDeltaPx(before: CallPipDockRectProbe, after: CallPipDockRectProbe): number {
  return Math.abs(after.top - before.top);
}

export function evaluateDockScrollStabilityPass(maxDeltaPx: number, tolerancePx = 0): boolean {
  return maxDeltaPx <= tolerancePx;
}

export function evaluateVideoIdentityStablePass(beforeId: string | null, afterId: string | null): boolean {
  if (!beforeId || !afterId) return beforeId === afterId;
  return beforeId === afterId;
}

export function evaluateScenarioVerdict(input: {
  scenario: string;
  iterations: number;
  pass: number;
  fail: number;
  maxPositionDeltaPx: number;
  videoRecreateCount: number;
  failures?: string[];
}): CallPipDockScenarioVerdict {
  return {
    scenario: input.scenario,
    iterations: input.iterations,
    pass: input.pass,
    fail: input.fail,
    maxPositionDeltaPx: input.maxPositionDeltaPx,
    videoRecreateCount: input.videoRecreateCount,
    failures: input.failures ?? [],
  };
}

/** DOM — Dock layer rect (browser·jsdom) */
export function readDockLayerRectProbe(root: ParentNode = document): CallPipDockRectProbe | null {
  if (typeof document === "undefined") return null;
  const el = root.querySelector(CALL_DOCK_LAYER_SELECTOR);
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  const zIndex = Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || CALL_DOCK_LAYER_Z_INDEX;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    zIndex,
  };
}

/** DOM — video element identity (재생성·재마운트 탐지) */
export function readVideoElementIdentityProbe(
  root: ParentNode = document,
  selector: string = CALL_VIDEO_PROBE_SELECTOR
): string | null {
  if (typeof document === "undefined") return null;
  const video = root.querySelector(selector);
  if (!(video instanceof HTMLVideoElement)) return null;
  const existing = video.getAttribute("data-dibay-qa-video-id");
  if (existing) return existing;
  const id = `qa-video-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  video.setAttribute("data-dibay-qa-video-id", id);
  return id;
}

/** DOM — scroll 전후 Dock top delta (0px PASS) */
export async function readDockLayerScrollDeltaProbe(options?: {
  root?: ParentNode;
  scrollDeltaPx?: number;
}): Promise<number> {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const root = options?.root ?? document;
  const layer = root.querySelector(CALL_DOCK_LAYER_SELECTOR);
  if (!(layer instanceof HTMLElement)) return 0;

  const before = layer.getBoundingClientRect().top;
  const prevScrollY = window.scrollY;
  const delta = options?.scrollDeltaPx ?? 240;

  window.scrollTo(0, prevScrollY + delta);
  await nextAnimationFrame();
  await nextAnimationFrame();

  const after = layer.getBoundingClientRect().top;
  window.scrollTo(0, prevScrollY);

  return Math.abs(after - before);
}

export function readCallPipDockProbeSnapshot(sessionId: string | null): CallPipDockProbeSnapshot {
  const sid = sessionId?.trim() || "";
  const surface = sid ? readCallPresentationSurfaceProbe(sid) : "NONE";
  return {
    at: Date.now(),
    sessionId: sid || null,
    surface,
    androidOsPipSafeMode: sid ? readAndroidOsPipSafeModeProbe(sid) : false,
    dockLayerVisible: readCallDockLayerGateProbe(),
    overlayToastSuppressed: readCallOverlaySuppressProbe(),
    dockPresentationPhase: readDockPresentationPhaseProbe(),
    presentationMutualExclusive: surface === "NONE" ? true : readPresentationMutualExclusiveProbe(surface),
    dockRect: typeof document !== "undefined" ? readDockLayerRectProbe() : null,
    videoElementId: typeof document !== "undefined" ? readVideoElementIdentityProbe() : null,
  };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export type CallPipDockWindowProbes = {
  snapshot: (sessionId?: string | null) => CallPipDockProbeSnapshot;
  readDockRect: () => CallPipDockRectProbe | null;
  readDockScrollDelta: (scrollDeltaPx?: number) => Promise<number>;
  readVideoId: () => string | null;
  readSurface: (sessionId: string) => CallPresentationSurface;
};

declare global {
  interface Window {
    __dibayCallPipDockProbes?: CallPipDockWindowProbes;
  }
}

/** Playwright/CDP — `window.__dibayCallPipDockProbes` 설치 */
export function installCallPipDockProbesOnWindow(): void {
  if (typeof window === "undefined") return;
  window.__dibayCallPipDockProbes = {
    snapshot: (sessionId) => readCallPipDockProbeSnapshot(sessionId ?? null),
    readDockRect: () => readDockLayerRectProbe(),
    readDockScrollDelta: (scrollDeltaPx) => readDockLayerScrollDeltaProbe({ scrollDeltaPx }),
    readVideoId: () => readVideoElementIdentityProbe(),
    readSurface: (sessionId) => readCallPresentationSurfaceProbe(sessionId),
  };
}

/** QA harness — Dock 고정 inset 기대값 (safe-top+12, 좌우 12px) */
export function readExpectedDockHorizontalInsetPx(): number {
  return CALL_DOCK_HORIZONTAL_INSET_PX;
}
