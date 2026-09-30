/**
 * REBUILD 14 P2 — ONE StartupCompositorEngine (shared semantic runtime).
 *
 * No UIKit / Android View / Capacitor plugin UI imports.
 * Thin hosts adapt platform primitives only.
 *
 * Does NOT choose package, bootstrap, timers, or invent fallback visuals.
 */

import { IntroCtaActionGate, type IntroCtaIntent } from "@/lib/startup-compositor/intro/cta";
import {
  evaluateIntroToHomeHandoff,
  evaluateSsToHomeWhenIntroAbsent,
  evaluateSsToIntroHandoff,
  HandoffOnceGate,
} from "@/lib/startup-compositor/intro/handoff";
import {
  canAdvanceIntroVisibility,
  type IntroVisibilityStep,
} from "@/lib/startup-compositor/intro/phase";
import type { IntroPhaseModel, IntroRenderModel } from "@/lib/startup-compositor/intro/render-model";
import { IntroTimelineClock } from "@/lib/startup-compositor/intro/timeline";
import { STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE } from "@/lib/startup-compositor/runtime/activation";
import type { CompositorSurfacePhase } from "@/lib/startup-compositor/runtime/events";
import {
  advanceSystemStartReadiness,
  createSystemStartPhaseState,
  mayClaimOwnerVisible,
  type SystemStartPhaseState,
  type SystemStartReadiness,
} from "@/lib/startup-compositor/system-start/phase";
import type { SystemStartRenderModel } from "@/lib/startup-compositor/system-start/render-model";
import { SystemStartMinVisibleGate } from "@/lib/startup-compositor/system-start/timing";

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
  /** PHASE = SYSTEM_START bind (semantic/render only; not Owner-visible). */
  private systemStartModel: SystemStartRenderModel | null = null;
  private systemStartPhase: SystemStartPhaseState = createSystemStartPhaseState();
  private minVisibleGate: SystemStartMinVisibleGate | null = null;
  /** PHASE = INTRO bind (same compositor lifetime; not a second surface). */
  private introModel: IntroPhaseModel | null = null;
  private introVisibility: IntroVisibilityStep = "INTRO_IR_READY";
  private introTimeline = new IntroTimelineClock();
  private introCta = new IntroCtaActionGate();
  private introHandoffGate = new HandoffOnceGate();
  private introCompleteIntent = false;
  private retainingLastIntroFrame = false;

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

  /**
   * Bind SYSTEM_START phase render model into the ONE compositor engine.
   * Does not activate Production presentation or attach a second surface.
   */
  bindSystemStartRenderModel(model: SystemStartRenderModel): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    if (model.phase !== "SYSTEM_START" || !model.ssRenderReady) {
      return { ok: false, reason: "system_start_model_invalid", phase: this.phase };
    }
    this.systemStartModel = model;
    this.bindGenerationReference(model.generationId);
    this.minVisibleGate = new SystemStartMinVisibleGate(model.minVisibleMs, () => Date.now());
    let st = createSystemStartPhaseState();
    const ir = advanceSystemStartReadiness(st, "SS_IR_READY", model.generationId);
    if (!ir.ok) return { ok: false, reason: ir.reason, phase: this.phase };
    st = ir.value;
    const rr = advanceSystemStartReadiness(st, "SS_RENDER_READY", model.generationId);
    if (!rr.ok) return { ok: false, reason: rr.reason, phase: this.phase };
    this.systemStartPhase = rr.value;
    return { ok: true, phase: this.phase };
  }

  getSystemStartRenderModel(): SystemStartRenderModel | null {
    return this.systemStartModel;
  }

  getSystemStartPhaseState(): SystemStartPhaseState {
    return this.systemStartPhase;
  }

  getMinVisibleGate(): SystemStartMinVisibleGate | null {
    return this.minVisibleGate;
  }

  /**
   * Bind INTRO phase model into the SAME compositor engine.
   * Does not attach an independent Intro presentation host.
   */
  bindIntroPhaseModel(model: IntroPhaseModel): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    this.introModel = model;
    this.introTimeline.reset();
    this.introHandoffGate.reset();
    this.introCompleteIntent = false;
    this.retainingLastIntroFrame = false;
    if (model.kind === "INTRO_ABSENT") {
      this.introVisibility = "INTRO_IR_READY";
      this.introCta.bind(0, 0);
      return { ok: true, phase: this.phase };
    }
    this.introVisibility = model.visibility;
    this.introTimeline.setVisibility(model.visibility);
    this.introCta.bind(model.scenes.length, model.activeSceneIndex);
    return { ok: true, phase: this.phase };
  }

  getIntroPhaseModel(): IntroPhaseModel | null {
    return this.introModel;
  }

  getIntroVisibility(): IntroVisibilityStep {
    return this.introVisibility;
  }

  getIntroTimeline(): IntroTimelineClock {
    return this.introTimeline;
  }

  getIntroCtaGate(): IntroCtaActionGate {
    return this.introCta;
  }

  isRetainingLastIntroFrame(): boolean {
    return this.retainingLastIntroFrame;
  }

  hasIntroCompleteIntent(): boolean {
    return this.introCompleteIntent || this.introCta.hasCompletionIntent();
  }

  /**
   * Advance Intro visibility ladder. OWNER_VISIBLE starts timeline once.
   * Production inactive → OWNER_VISIBLE requires test harness flag (same as SS).
   */
  advanceIntroVisibility(
    next: IntroVisibilityStep,
    opts?: { readonly testHarnessAllowOwnerVisibleSemantic?: boolean },
  ): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (!this.introModel || this.introModel.kind !== "INTRO_PHASE") {
      return { ok: false, reason: "intro_not_bound", phase: this.phase };
    }
    if (next === this.introVisibility) {
      if (next === "INTRO_OWNER_VISIBLE") {
        this.introTimeline.markOwnerVisible(); // duplicate = no restart
      }
      return { ok: true, phase: this.phase };
    }
    if (!canAdvanceIntroVisibility(this.introVisibility, next)) {
      // allow jump to OWNER_VISIBLE from FRAME_COMMITTED only via consecutive steps
      return { ok: false, reason: "intro_visibility_skip", phase: this.phase };
    }
    if (next === "INTRO_OWNER_VISIBLE" || next === "INTRO_TIMELINE_RUNNING") {
      const allow =
        STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE ||
        opts?.testHarnessAllowOwnerVisibleSemantic === true;
      if (!allow) {
        return {
          ok: false,
          reason: "owner_visible_forbidden_while_production_inactive",
          phase: this.phase,
        };
      }
    }
    this.introVisibility = next;
    this.introTimeline.setVisibility(next);
    if (this.introModel.kind === "INTRO_PHASE") {
      const updated: IntroRenderModel = {
        ...this.introModel,
        visibility: next,
      };
      this.introModel = updated;
    }
    if (next === "INTRO_OWNER_VISIBLE") {
      this.introTimeline.markOwnerVisible();
    }
    return { ok: true, phase: this.phase };
  }

  dispatchIntroCta(
    intent: IntroCtaIntent,
    actionToken: string,
  ): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    const r = this.introCta.dispatch(intent, actionToken);
    if (!r.ok) {
      return { ok: false, reason: r.reason, phase: this.phase };
    }
    if (r.applied && r.intent.kind === "NEXT" && this.introModel?.kind === "INTRO_PHASE") {
      this.introModel = {
        ...this.introModel,
        activeSceneIndex: r.intent.sceneIndex,
      };
      this.introTimeline.setSceneIndex(r.intent.sceneIndex);
    }
    if (
      r.applied &&
      (r.intent.kind === "FINISH" || r.intent.kind === "INTERNAL_DESTINATION")
    ) {
      this.introCompleteIntent = true;
      this.evaluateIntroCompletionHandoff();
    }
    return { ok: true, phase: this.phase };
  }

  /**
   * Semantic SS→Intro guard (same compositor). Does not paint.
   */
  trySsToIntroTransition(args: {
    readonly systemStartMinVisibleElapsed: boolean;
    readonly introScene1Paintable: boolean;
  }): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    const present = this.introModel?.kind === "INTRO_PHASE";
    const guard = evaluateSsToIntroHandoff({
      systemStartMinVisibleElapsed: args.systemStartMinVisibleElapsed,
      introScene1Paintable: args.introScene1Paintable,
      introPresent: present,
    });
    if (!guard.allowed) {
      return { ok: false, reason: guard.reason, phase: this.phase };
    }
    return { ok: true, phase: this.phase };
  }

  private evaluateIntroCompletionHandoff(): void {
    const homeReady = this.homeReadyIngested || this.phase === "HOME_READY";
    const r = evaluateIntroToHomeHandoff({
      introCompleteIntent: this.hasIntroCompleteIntent(),
      homePresentationReady: homeReady,
    });
    if (r.action === "KEEP_LAST_INTRO_FRAME") {
      this.retainingLastIntroFrame = true;
      return;
    }
    if (r.action === "HANDOFF") {
      this.retainingLastIntroFrame = false;
      if (this.introHandoffGate.tryFire()) {
        this.requestHandoff();
      }
    }
  }

  /**
   * Intro-absent path after SS minVisible + Home ready.
   */
  trySsToHomeWhenIntroAbsent(args: {
    readonly systemStartMinVisibleElapsed: boolean;
  }): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    const present = this.introModel?.kind === "INTRO_PHASE";
    const r = evaluateSsToHomeWhenIntroAbsent({
      introPresent: present,
      systemStartMinVisibleElapsed: args.systemStartMinVisibleElapsed,
      homePresentationReady: this.homeReadyIngested || this.phase === "HOME_READY",
    });
    if (r.action === "HANDOFF") {
      if (this.introHandoffGate.tryFire()) {
        return this.requestHandoff();
      }
      return { ok: true, phase: this.phase };
    }
    if (r.action === "KEEP_LAST_INTRO_FRAME") {
      this.retainingLastIntroFrame = true;
      return { ok: false, reason: r.reason, phase: this.phase };
    }
    return { ok: false, reason: r.reason, phase: this.phase };
  }

  /**
   * Test-only / future host: advance SS readiness. OWNER_VISIBLE blocked unless
   * production active OR explicit test harness (P3 Production = false).
   */
  advanceSystemStartReadiness(
    next: SystemStartReadiness,
    opts?: { readonly testHarnessAllowOwnerVisibleSemantic?: boolean },
  ): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (next === "SS_OWNER_VISIBLE") {
      const allow = mayClaimOwnerVisible({
        productionPresentationActive: STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
        testHarnessAllowOwnerVisibleSemantic:
          opts?.testHarnessAllowOwnerVisibleSemantic === true,
      });
      if (!allow) {
        return {
          ok: false,
          reason: "owner_visible_forbidden_while_production_inactive",
          phase: this.phase,
        };
      }
    }
    const r = advanceSystemStartReadiness(
      this.systemStartPhase,
      next,
      this.systemStartPhase.generationId,
    );
    if (!r.ok) return { ok: false, reason: r.reason, phase: this.phase };
    this.systemStartPhase = r.value;
    return { ok: true, phase: this.phase };
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
    if (this.hasIntroCompleteIntent()) {
      this.evaluateIntroCompletionHandoff();
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
    this.introTimeline.resumeFromForeground();
    return { ok: true, phase: this.phase };
  }

  notifyBackground(): EngineActionResult {
    if (this.destroyed) {
      return { ok: false, reason: "destroyed", phase: this.phase };
    }
    if (this.phase === "DONE") {
      return { ok: false, reason: "late_event_after_done", phase: this.phase };
    }
    this.introTimeline.setBackgrounded(true);
    return { ok: true, phase: this.phase };
  }

  destroy(): EngineActionResult {
    if (this.destroyed) {
      return { ok: true, phase: "DESTROYED" };
    }
    this.attached = false;
    this.systemStartModel = null;
    this.systemStartPhase = createSystemStartPhaseState();
    this.minVisibleGate = null;
    this.introModel = null;
    this.introTimeline.reset();
    this.introHandoffGate.reset();
    this.introCompleteIntent = false;
    this.retainingLastIntroFrame = false;
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
