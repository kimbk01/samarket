/**
 * REBUILD 14 P3 — shared System Start minVisible timing (injected clock).
 *
 * T0 = first OWNER_VISIBLE System Start frame (not IR/render/attach).
 * No Android/iOS native timers.
 */

export type Clock = () => number;

export type SystemStartMinVisibleState = {
  readonly t0Ms: number | null;
  readonly accumulatedVisibleMs: number;
  readonly currentlyVisible: boolean;
  readonly minVisibleMs: number;
};

/**
 * Shared minVisible gate. Hosts must not implement parallel timers.
 */
export class SystemStartMinVisibleGate {
  private readonly minVisibleMs: number;
  private readonly now: Clock;
  private t0Ms: number | null = null;
  private accumulatedVisibleMs = 0;
  private currentlyVisible = false;
  private visibleSegmentStartMs: number | null = null;

  constructor(minVisibleMs: number, now: Clock = () => Date.now()) {
    if (!Number.isFinite(minVisibleMs) || minVisibleMs < 0) {
      throw new Error("min_visible_ms_invalid");
    }
    this.minVisibleMs = minVisibleMs;
    this.now = now;
  }

  getState(): SystemStartMinVisibleState {
    return {
      t0Ms: this.t0Ms,
      accumulatedVisibleMs: this.snapshotAccumulated(),
      currentlyVisible: this.currentlyVisible,
      minVisibleMs: this.minVisibleMs,
    };
  }

  /**
   * OWNER_VISIBLE edge. Idempotent: first call sets T0; duplicates do not restart.
   * Pre-visible / IR-ready / attach must NOT call this.
   */
  notifyOwnerVisible(): void {
    const t = this.now();
    if (this.t0Ms == null) {
      this.t0Ms = t;
    }
    if (!this.currentlyVisible) {
      this.currentlyVisible = true;
      this.visibleSegmentStartMs = t;
    }
  }

  /** Hidden / not Owner-visible — does not consume minVisible time. */
  notifyNotVisible(): void {
    if (this.currentlyVisible && this.visibleSegmentStartMs != null) {
      this.accumulatedVisibleMs += this.now() - this.visibleSegmentStartMs;
      this.visibleSegmentStartMs = null;
    }
    this.currentlyVisible = false;
  }

  /** Background lifecycle: same as not-visible for consumption (shared policy). */
  notifyBackground(): void {
    this.notifyNotVisible();
  }

  notifyForegroundVisible(): void {
    this.notifyOwnerVisible();
  }

  elapsedVisibleMs(): number {
    return this.snapshotAccumulated();
  }

  hasReachedMinVisible(): boolean {
    if (this.t0Ms == null) return false;
    return this.elapsedVisibleMs() >= this.minVisibleMs;
  }

  /**
   * Exit SS only when minVisible elapsed AND next phase ready.
   * Before T0 / OWNER_VISIBLE: always blocked.
   */
  canTransitionAfterMinVisible(nextReady: boolean): boolean {
    if (this.t0Ms == null) return false;
    if (!this.hasReachedMinVisible()) return false;
    return nextReady === true;
  }

  private snapshotAccumulated(): number {
    let total = this.accumulatedVisibleMs;
    if (this.currentlyVisible && this.visibleSegmentStartMs != null) {
      total += this.now() - this.visibleSegmentStartMs;
    }
    return total;
  }
}
