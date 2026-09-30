/**
 * REBUILD 14 P2 — ONE StartupCompositorEngine (shared semantic runtime).
 *
 * No UIKit / Android View / Capacitor plugin UI imports.
 * Thin hosts adapt platform primitives only.
 *
 * Does NOT choose package, bootstrap, timers, or invent fallback visuals.
 */

import { STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE } from "@/lib/startup-compositor/runtime/activation";
import type { CompositorSurfacePhase } from "@/lib/startup-compositor/runtime/events";

export type EngineActionResult =
  | { readonly ok: true; readonly phase: CompositorSurfacePhase }
  | { readonly ok: false; readonly reason: string; readonly phase: CompositorSurfacePhase };

const instances = new Map<string, StartupCompositorEngine>();

export class StartupCompositorEngine {
  readonly rootId: string;
  private phase: CompositorSurfacePhase = "IDLE";
  private attached = false;
  private detachedAfterHandoff = false;
  private homeReadyIngested = false;
  private handoffRequested = false;
  private handoffComplete = false;
  private destroyed = false;
  private generationRef: string | null = null;

  private constructor(rootId: string) {
    this.rootId = rootId;
  }

  /** At most one engine instance per root lifecycle id. */
  static getOrCreate(rootId: string): StartupCompositorEngine {
    const key = String(rootId || "").trim() || "default";
    let eng = instances.get(key);
    if (!eng || eng.destroyed) {
      eng = new StartupCompositorEngine(key);
      instances.set(key, eng);
    }
    return eng;
  }

  static resetRegistryForTests(): void {
    instances.clear();
  }

  static instanceCountForTests(): number {
    let n = 0;
    for (const e of instances.values()) {
      if (!e.destroyed) n += 1;
    }
    return n;
  }

  getPhase(): CompositorSurfacePhase {
    return this.phase;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isProductionPresentationActive(): boolean {
    return STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE;
  }

  /** Structural binding only — engine does not validate/choose package. */
  bindGenerationReference(generationId: string | null): void {
    if (this.destroyed || this.phase === "DONE") return;
    this.generationRef = generationId;
  }

  getGenerationReference(): string | null {
    return this.generationRef;
  }

  attach(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    if (this.attached) {
      return { ok: true, phase: this.phase }; // idempotent
    }
    this.attached = true;
    this.phase = "ATTACHED";
    return { ok: true, phase: this.phase };
  }

  notifyPaintable(): EngineActionResult {
    return this.advanceFromAttached("PAINTABLE", ["ATTACHED", "PAINTABLE"]);
  }

  notifyFirstFrameCommitted(): EngineActionResult {
    return this.advanceFromAttached("FIRST_FRAME_COMMITTED", [
      "ATTACHED",
      "PAINTABLE",
      "FIRST_FRAME_COMMITTED",
    ]);
  }

  notifyOwnerVisible(): EngineActionResult {
    return this.advanceFromAttached("OWNER_VISIBLE", [
      "ATTACHED",
      "PAINTABLE",
      "FIRST_FRAME_COMMITTED",
      "OWNER_VISIBLE",
    ]);
  }

  /**
   * ONE HOME_PRESENTATION_READY ingress for the shared engine.
   * Hosts must forward here; must not invent parallel ready graphs.
   */
  ingestHomePresentationReady(_source: string): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    if (this.homeReadyIngested) {
      return { ok: true, phase: this.phase }; // idempotent
    }
    this.homeReadyIngested = true;
    if (
      this.phase === "ATTACHED" ||
      this.phase === "PAINTABLE" ||
      this.phase === "FIRST_FRAME_COMMITTED" ||
      this.phase === "OWNER_VISIBLE" ||
      this.phase === "IDLE"
    ) {
      this.phase = "HOME_READY";
    }
    return { ok: true, phase: this.phase };
  }

  requestHandoff(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    if (this.handoffRequested) {
      return { ok: true, phase: this.phase };
    }
    if (!this.homeReadyIngested && this.phase !== "HOME_READY") {
      return { ok: false, reason: "home_not_ready", phase: this.phase };
    }
    this.handoffRequested = true;
    this.phase = "HANDOFF";
    return { ok: true, phase: this.phase };
  }

  completeHandoff(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.handoffComplete || this.phase === "DONE") {
      return { ok: true, phase: this.phase === "DONE" ? "DONE" : this.phase };
    }
    if (!this.handoffRequested && this.phase !== "HANDOFF") {
      return { ok: false, reason: "handoff_not_requested", phase: this.phase };
    }
    this.handoffComplete = true;
    this.phase = "DONE";
    return { ok: true, phase: this.phase };
  }

  detach(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (!this.attached) {
      return { ok: true, phase: this.phase };
    }
    if (this.phase !== "DONE" && this.phase !== "HANDOFF") {
      // allow detach on destroy path; otherwise prefer handoff first
      if (!this.handoffComplete) {
        // structural: detach after handoff preferred; destroy() also clears
      }
    }
    this.attached = false;
    this.detachedAfterHandoff = this.phase === "DONE" || this.handoffComplete;
    return { ok: true, phase: this.phase };
  }

  /** Foreground/background must not create a second instance. */
  notifyForeground(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    return { ok: true, phase: this.phase };
  }

  notifyBackground(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    return { ok: true, phase: this.phase };
  }

  destroy(): EngineActionResult {
    if (this.destroyed) {
      return { ok: true, phase: "DESTROYED" };
    }
    this.attached = false;
    this.destroyed = true;
    this.phase = "DESTROYED";
    instances.delete(this.rootId);
    return { ok: true, phase: this.phase };
  }

  /** Hosts must not call this — structural guard for tests. */
  hostAttemptSemanticTransition(_forbidden: string): EngineActionResult {
    return {
      ok: false,
      reason: "host_semantic_transition_forbidden",
      phase: this.phase,
    };
  }

  wasDetachedAfterHandoff(): boolean {
    return this.detachedAfterHandoff;
  }

  private advanceFromAttached(
    next: CompositorSurfacePhase,
    allowed: CompositorSurfacePhase[],
  ): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    if (!this.attached && this.phase === "IDLE") {
      return { ok: false, reason: "not_attached", phase: this.phase };
    }
    if (this.phase === next) {
      return { ok: true, phase: this.phase };
    }
    if (!allowed.includes(this.phase) && this.phase !== next) {
      // allow monotonic skip forward within skeleton ladder
      const order: CompositorSurfacePhase[] = [
        "ATTACHED",
        "PAINTABLE",
        "FIRST_FRAME_COMMITTED",
        "OWNER_VISIBLE",
      ];
      const cur = order.indexOf(this.phase);
      const tgt = order.indexOf(next);
      if (cur >= 0 && tgt >= 0 && tgt >= cur) {
        this.phase = next;
        return { ok: true, phase: this.phase };
      }
      return { ok: false, reason: "invalid_phase", phase: this.phase };
    }
    this.phase = next;
    return { ok: true, phase: this.phase };
  }
}
