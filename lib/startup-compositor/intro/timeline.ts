/**
 * REBUILD 14 P4 — Intro timeline (shared semantic clock).
 *
 * IMPLEMENTATION_CHOICE (reported, not Owner-locked):
 * - Scene duration = authored visible content clock (starts when scene becomes visible).
 * - Transition duration = ADDITIONAL between scenes (not included in scene durationMs).
 *
 * Element motion timing is relative to scene-visible T0.
 * Timeline consumes time ONLY while OWNER_VISIBLE and not covered/backgrounded.
 */

import type { IntroVisibilityStep } from "@/lib/startup-compositor/intro/phase";

export type IntroTimelinePolicy = {
  /** Transition duration is additional to scene duration. */
  readonly transitionDurationMode: "ADDITIONAL_TO_SCENE";
  /** Element motion startMs relative to scene visible T0. */
  readonly elementMotionReference: "SCENE_VISIBLE_T0";
};

export const INTRO_TIMELINE_POLICY: IntroTimelinePolicy = {
  transitionDurationMode: "ADDITIONAL_TO_SCENE",
  elementMotionReference: "SCENE_VISIBLE_T0",
};

export type IntroTimelineState = {
  readonly running: boolean;
  readonly ownerVisible: boolean;
  readonly covered: boolean;
  readonly backgrounded: boolean;
  readonly sceneIndex: number;
  readonly sceneElapsedMs: number;
  readonly totalConsumedMs: number;
  readonly visibility: IntroVisibilityStep;
};

export class IntroTimelineClock {
  private running = false;
  private ownerVisible = false;
  private covered = false;
  private backgrounded = false;
  private sceneIndex = 0;
  private sceneElapsedMs = 0;
  private totalConsumedMs = 0;
  private visibility: IntroVisibilityStep = "INTRO_IR_READY";
  private ownerVisibleLatched = false;

  reset(): void {
    this.running = false;
    this.ownerVisible = false;
    this.covered = false;
    this.backgrounded = false;
    this.sceneIndex = 0;
    this.sceneElapsedMs = 0;
    this.totalConsumedMs = 0;
    this.visibility = "INTRO_IR_READY";
    this.ownerVisibleLatched = false;
  }

  setVisibility(step: IntroVisibilityStep): void {
    this.visibility = step;
    if (step === "INTRO_OWNER_VISIBLE" || step === "INTRO_TIMELINE_RUNNING") {
      this.markOwnerVisible();
    }
  }

  /**
   * First OWNER_VISIBLE starts timeline. Duplicate OWNER_VISIBLE does not restart.
   */
  markOwnerVisible(): { readonly started: boolean; readonly restarted: boolean } {
    if (this.ownerVisibleLatched) {
      this.ownerVisible = true;
      this.covered = false;
      this.syncRunning();
      return { started: false, restarted: false };
    }
    this.ownerVisibleLatched = true;
    this.ownerVisible = true;
    this.covered = false;
    this.visibility = "INTRO_OWNER_VISIBLE";
    this.sceneElapsedMs = 0;
    this.syncRunning();
    if (this.running) {
      this.visibility = "INTRO_TIMELINE_RUNNING";
    }
    return { started: this.running, restarted: false };
  }

  setCovered(covered: boolean): void {
    this.covered = covered;
    this.syncRunning();
  }

  setBackgrounded(backgrounded: boolean): void {
    this.backgrounded = backgrounded;
    this.syncRunning();
  }

  setSceneIndex(index: number): void {
    this.sceneIndex = Math.max(0, index);
    this.sceneElapsedMs = 0;
  }

  private syncRunning(): void {
    this.running =
      this.ownerVisible && !this.covered && !this.backgrounded && this.ownerVisibleLatched;
    if (this.running && this.visibility === "INTRO_OWNER_VISIBLE") {
      this.visibility = "INTRO_TIMELINE_RUNNING";
    }
  }

  /**
   * Advance shared clock. Hidden/covered/backgrounded delta is NOT consumed.
   */
  advance(deltaMs: number): IntroTimelineState {
    if (this.running && deltaMs > 0) {
      this.sceneElapsedMs += deltaMs;
      this.totalConsumedMs += deltaMs;
    }
    return this.snapshot();
  }

  snapshot(): IntroTimelineState {
    return {
      running: this.running,
      ownerVisible: this.ownerVisible,
      covered: this.covered,
      backgrounded: this.backgrounded,
      sceneIndex: this.sceneIndex,
      sceneElapsedMs: this.sceneElapsedMs,
      totalConsumedMs: this.totalConsumedMs,
      visibility: this.visibility,
    };
  }

  /** Resume continues canonical timeline (does not reset sceneElapsed). */
  resumeFromForeground(): IntroTimelineState {
    this.backgrounded = false;
    this.covered = false;
    this.syncRunning();
    return this.snapshot();
  }
}
