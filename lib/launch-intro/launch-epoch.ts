/**
 * DIBAY Intro — native cold-launch epoch (contract §12).
 *
 * `window.__DIBAY_LAUNCH_EPOCH__` is injected by native at document start, once per native
 * process (Android MainActivity.LAUNCH_EPOCH / iOS DibayRootBridgeViewController.launchEpoch).
 * Same process → same epoch across WebView/document reload, SPA navigation, Android Activity
 * recreation and iOS web-content-process recreation. New process → new epoch.
 * No epoch (old native build, web, Windows) → Intro BYPASS.
 * No timestamps, TTLs or heuristics.
 */

const EPOCH_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const SHOWN_EPOCH_KEY = "dibay:launch-intro:shown-epoch";

export function readLaunchEpoch(): string | null {
  if (typeof window === "undefined") return null;
  const v = (window as unknown as { __DIBAY_LAUNCH_EPOCH__?: unknown }).__DIBAY_LAUNCH_EPOCH__;
  return typeof v === "string" && EPOCH_RE.test(v) ? v : null;
}

export function readShownLaunchEpoch(): string | null {
  try {
    return window.localStorage.getItem(SHOWN_EPOCH_KEY);
  } catch {
    return null;
  }
}

/** Marks the Intro as shown in this native launch epoch (every_launch = at most once per epoch). */
export function markLaunchEpochShown(epoch: string): void {
  try {
    window.localStorage.setItem(SHOWN_EPOCH_KEY, epoch);
  } catch {
    /* storage unavailable: the epoch compare then fails closed only for this process */
  }
}

/** Per-document id (new on every document load; used only for discovery diagnostics). */
export const LAUNCH_INTRO_DOCUMENT_ID: string =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "doc-unavailable";
