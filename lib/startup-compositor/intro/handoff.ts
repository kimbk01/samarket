/**
 * REBUILD 14 P4 — SS→Intro and Intro→Home semantic handoffs (same compositor).
 * No blank frames; no WebView early reveal.
 */

export type SsToIntroGuardInput = {
  readonly systemStartMinVisibleElapsed: boolean;
  readonly introScene1Paintable: boolean;
  readonly introPresent: boolean;
};

export type SsToIntroGuardResult =
  | { readonly allowed: true; readonly retainSystemStartUntilIntroFrame: true }
  | { readonly allowed: false; readonly reason: string };

/**
 * SYSTEM_START → INTRO only when SS minVisible elapsed AND Intro Scene1 PAINTABLE.
 * Do NOT remove SS before Intro meaningful frame exists.
 */
export function evaluateSsToIntroHandoff(
  input: SsToIntroGuardInput,
): SsToIntroGuardResult {
  if (!input.introPresent) {
    return { allowed: false, reason: "intro_absent" };
  }
  if (!input.systemStartMinVisibleElapsed) {
    return { allowed: false, reason: "ss_min_visible_not_elapsed" };
  }
  if (!input.introScene1Paintable) {
    return { allowed: false, reason: "intro_scene1_not_paintable" };
  }
  return { allowed: true, retainSystemStartUntilIntroFrame: true };
}

export type IntroToHomeGuardInput = {
  readonly introCompleteIntent: boolean;
  readonly homePresentationReady: boolean;
};

export type IntroToHomeGuardResult =
  | { readonly action: "HANDOFF" }
  | { readonly action: "KEEP_LAST_INTRO_FRAME"; readonly reason: string }
  | { readonly action: "WAIT"; readonly reason: string };

/**
 * Intro completion does NOT immediately expose WebView unless HOME ready.
 * Keep last authored Intro frame until HOME_PRESENTATION_READY → HANDOFF.
 */
export function evaluateIntroToHomeHandoff(
  input: IntroToHomeGuardInput,
): IntroToHomeGuardResult {
  if (!input.introCompleteIntent) {
    return { action: "WAIT", reason: "intro_not_complete" };
  }
  if (!input.homePresentationReady) {
    return {
      action: "KEEP_LAST_INTRO_FRAME",
      reason: "home_not_ready",
    };
  }
  return { action: "HANDOFF" };
}

/**
 * Intro absent path: SYSTEM_START → HOME_READY → HANDOFF.
 */
export function evaluateSsToHomeWhenIntroAbsent(input: {
  readonly introPresent: boolean;
  readonly systemStartMinVisibleElapsed: boolean;
  readonly homePresentationReady: boolean;
}): IntroToHomeGuardResult {
  if (input.introPresent) {
    return { action: "WAIT", reason: "intro_present" };
  }
  if (!input.systemStartMinVisibleElapsed) {
    return { action: "WAIT", reason: "ss_min_visible_not_elapsed" };
  }
  if (!input.homePresentationReady) {
    return {
      action: "KEEP_LAST_INTRO_FRAME",
      reason: "home_not_ready_retain_ss",
    };
  }
  return { action: "HANDOFF" };
}

export class HandoffOnceGate {
  private fired = false;

  tryFire(): boolean {
    if (this.fired) return false;
    this.fired = true;
    return true;
  }

  hasFired(): boolean {
    return this.fired;
  }

  reset(): void {
    this.fired = false;
  }
}
