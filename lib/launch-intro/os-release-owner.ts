/**
 * DIBAY Intro — OS release ownership (contract §9).
 *
 * Exactly one startup destination owns the OS (Android SplashScreen / iOS LaunchScreen
 * continuation) release. Default owner = COMMUNITY, so a launch where the Intro gate never
 * selects INTRO behaves exactly as before. When the gate selects INTRO, Community's
 * initial-destination signal cannot release the OS; only the Intro first meaningful frame can.
 * The only allowed change after selection is INTRO → COMMUNITY, once, before release.
 *
 * Pure module state — no timers, no network, no DOM.
 */

export type LaunchOsReleaseOwner = "community" | "intro";

let owner: LaunchOsReleaseOwner = "community";
let switchedBack = false;
let released = false;
const releasedListeners = new Set<() => void>();

export function getLaunchOsReleaseOwner(): LaunchOsReleaseOwner {
  return owner;
}

/** Gate selected INTRO before any release. No-op after release or after a switch back. */
export function claimLaunchOsReleaseForIntro(): boolean {
  if (released || switchedBack) return false;
  owner = "intro";
  return true;
}

/** INTRO → COMMUNITY, once, only before the OS has been released. */
export function handLaunchOsReleaseToCommunity(): boolean {
  if (released || owner !== "intro") return false;
  owner = "community";
  switchedBack = true;
  return true;
}

export function isLaunchOsReleased(): boolean {
  return released;
}

/** Called by the single release path in startup-metrics after the owner released the OS. */
export function noteLaunchOsReleased(): void {
  if (released) return;
  released = true;
  for (const listener of [...releasedListeners]) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
  releasedListeners.clear();
}

/** Runs `run` once the OS has been released (immediately if it already was). */
export function onLaunchOsReleased(run: () => void): () => void {
  if (released) {
    run();
    return () => {};
  }
  releasedListeners.add(run);
  return () => {
    releasedListeners.delete(run);
  };
}
