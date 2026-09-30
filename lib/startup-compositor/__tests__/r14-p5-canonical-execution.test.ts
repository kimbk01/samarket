/**
 * REBUILD 14 P5 — Canonical geometry / motion / transition / CTA execution.
 * STRUCTURAL / AUTOMATED only. No device / Production claims.
 */

import { describe, expect, it } from "vitest";
import {
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
  getStartupCompositorActivation,
  parseNormalizedFrame,
  applyExplicitCenter,
  explicitCenterFrame,
  fitMediaDrawInFrame,
  fitIntrinsicIntoMaxBox,
  containMediaFrame,
  replaceElementMedia,
  IntroTimelineClock,
  IntroCtaActionGate,
  mapDocumentCtaAction,
  rejectRawUrlDestination,
  evaluateIntroToHomeHandoff,
  HandoffOnceGate,
  validateMotionToken,
  validateTransitionToken,
  MOTION_TYPES_V1,
  TRANSITION_TYPES_V1,
  CTA_INTERNAL_DESTINATIONS,
  CANONICAL_AUTHORITY_ROWS,
  CANONICAL_COMPOSITION_ASPECT,
  MOTION_ENTER_DISTANCE_NORM,
  MOTION_ENTER_DISTANCE_CLASSIFICATION,
  MOTION_SCALE_IN_INITIAL,
  MOTION_SCALE_IN_CLASSIFICATION,
  MOTION_EASING,
  MOTION_EASING_CLASSIFICATION,
  clampUnit,
  motionLocalProgress,
  evaluateMotionProgress,
  evaluateMotionAtSceneElapsed,
  TRANSITION_DURATION_MODE,
  TRANSITION_DURATION_MODE_CLASSIFICATION,
  evaluateTransitionProgress,
  evaluateTransitionAtElapsed,
  CTA_DESTINATION_TABLE,
  resolveCtaDestination,
  listCtaDestinationKeys,
  createPreviewSemanticApi,
  createNativeAdapterContract,
  PREVIEW_SEMANTIC_MODULE_ID,
  NATIVE_SEMANTIC_MODULE_ID,
  INTRO_TIMELINE_POLICY,
  DEFAULT_ELEMENT_FIT,
} from "@/lib/startup-compositor";
import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";
import { INTRO13_SCHEMA_VERSION } from "@/lib/intro/contracts/document";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function miniDoc(): IntroDocumentV1 {
  return {
    schemaVersion: INTRO13_SCHEMA_VERSION,
    title: "p5",
    compositionAspect: { w: 9, h: 16 },
    scenes: [
      {
        id: "s1",
        name: "S1",
        durationMs: 2000,
        background: { type: "COLOR", color: "#000000" },
        transition: { type: "CUT", durationMs: 0 },
        elements: [
          {
            id: "img1",
            type: "IMAGE",
            frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
            zIndex: 1,
            visible: true,
            opacity: 1,
            motion: { type: "FADE_IN", startMs: 0, durationMs: 300 },
            payload: { mediaId: "m1", fit: "CONTAIN" },
          },
        ],
      },
    ],
  };
}

describe("R14-P5 geometry", () => {
  it("P5-01 canonical normalized frame", () => {
    expect(CANONICAL_COMPOSITION_ASPECT).toEqual({ w: 9, h: 16 });
    const ok = parseNormalizedFrame({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  it("P5-02 center formula", () => {
    const c = explicitCenterFrame({ x: 0, y: 0, w: 0.4, h: 0.2 });
    expect(c.x).toBeCloseTo((1 - 0.4) / 2);
    expect(c.y).toBeCloseTo((1 - 0.2) / 2);
    expect(c.w).toBeCloseTo(0.4);
    expect(c.h).toBeCloseTo(0.2);
  });

  it("P5-03 intrinsic portrait aspect CONTAIN", () => {
    const r = fitMediaDrawInFrame({
      frame: { x: 0, y: 0, w: 1, h: 1 },
      intrinsicAspect: 9 / 16,
      mode: "CONTAIN",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stretch).toBe(false);
    expect(r.value.draw.w / r.value.draw.h).toBeCloseTo(9 / 16, 5);
    expect(r.value.draw.w).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("P5-04 intrinsic landscape aspect CONTAIN", () => {
    const r = fitMediaDrawInFrame({
      frame: { x: 0, y: 0, w: 1, h: 1 },
      intrinsicAspect: 16 / 9,
      mode: "CONTAIN",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.draw.w / r.value.draw.h).toBeCloseTo(16 / 9, 5);
    expect(r.value.draw.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("P5-05 CONTAIN", () => {
    expect(DEFAULT_ELEMENT_FIT).toBe("CONTAIN");
    const r = fitMediaDrawInFrame({
      frame: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      intrinsicAspect: 1,
      mode: "CONTAIN",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mode).toBe("CONTAIN");
    expect(r.value.crop).toBe(false);
  });

  it("P5-06 COVER", () => {
    const r = fitMediaDrawInFrame({
      frame: { x: 0.1, y: 0.1, w: 0.8, h: 0.4 },
      intrinsicAspect: 1,
      mode: "COVER",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mode).toBe("COVER");
    expect(r.value.draw).toEqual(r.value.frame);
    expect(r.value.crop).toBe(true);
  });

  it("P5-07 no stretch", () => {
    const c = fitMediaDrawInFrame({
      frame: { x: 0, y: 0, w: 0.5, h: 0.8 },
      intrinsicAspect: 2,
      mode: "CONTAIN",
    });
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.value.stretch).toBe(false);
      expect(c.value.draw.w / c.value.draw.h).toBeCloseTo(2, 5);
    }
  });

  it("P5-08 no fixed square", () => {
    const f = containMediaFrame({ width: 100, height: 200 }, 0.82, 0.55);
    expect(Math.abs(f.w - f.h)).toBeGreaterThan(0.01);
    const unknown = containMediaFrame(null, 0.82, 0.55);
    expect(Math.abs(unknown.w - 0.55) > 0.01 || Math.abs(unknown.h - 0.55) > 0.01).toBe(
      true,
    );
  });

  it("P5-09 replace preserves frame", () => {
    const doc = miniDoc();
    const before = doc.scenes[0]!.elements[0]!.frame;
    const r = replaceElementMedia(doc, "img1", "m2");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.element.frame).toEqual(before);
    expect((r.element.payload as { mediaId: string }).mediaId).toBe("m2");
  });

  it("P5-10 replace preserves motion/timing", () => {
    const doc = miniDoc();
    const before = doc.scenes[0]!.elements[0]!.motion;
    const r = replaceElementMedia(doc, "img1", "m9");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.element.motion).toEqual(before);
    expect(r.element.id).toBe("img1");
  });

  it("P5-11 explicit center changes only position", () => {
    const frame = { x: 0.05, y: 0.7, w: 0.4, h: 0.2 };
    const c = applyExplicitCenter(frame);
    expect(c.w).toBeCloseTo(frame.w);
    expect(c.h).toBeCloseTo(frame.h);
    expect(c.x).toBeCloseTo((1 - frame.w) / 2);
    expect(c.y).toBeCloseTo((1 - frame.h) / 2);
  });
});

describe("R14-P5 motion", () => {
  it("P5-12 NONE", () => {
    const r = evaluateMotionProgress(
      { type: "NONE", startMs: 0, durationMs: 0 },
      0,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.opacity).toBe(1);
    expect(r.value.scale).toBe(1);
    expect(r.value.complete).toBe(true);
  });

  it("P5-13 FADE_IN progress", () => {
    const r = evaluateMotionProgress(
      { type: "FADE_IN", startMs: 0, durationMs: 300 },
      0.5,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.opacity).toBeCloseTo(0.5);
  });

  it("P5-14 ENTER_LEFT progress", () => {
    const r = evaluateMotionProgress(
      { type: "ENTER_LEFT", startMs: 0, durationMs: 300 },
      0,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.translateXNorm).toBeCloseTo(-MOTION_ENTER_DISTANCE_NORM);
    const mid = evaluateMotionProgress(
      { type: "ENTER_LEFT", startMs: 0, durationMs: 300 },
      1,
    );
    expect(mid.ok && mid.value.translateXNorm).toBeCloseTo(0);
  });

  it("P5-15 ENTER_RIGHT", () => {
    const r = evaluateMotionProgress(
      { type: "ENTER_RIGHT", startMs: 0, durationMs: 300 },
      0,
    );
    expect(r.ok && r.value.translateXNorm).toBeCloseTo(MOTION_ENTER_DISTANCE_NORM);
  });

  it("P5-16 ENTER_UP", () => {
    const r = evaluateMotionProgress(
      { type: "ENTER_UP", startMs: 0, durationMs: 300 },
      0,
    );
    expect(r.ok && r.value.translateYNorm).toBeCloseTo(-MOTION_ENTER_DISTANCE_NORM);
  });

  it("P5-17 ENTER_DOWN", () => {
    const r = evaluateMotionProgress(
      { type: "ENTER_DOWN", startMs: 0, durationMs: 300 },
      0,
    );
    expect(r.ok && r.value.translateYNorm).toBeCloseTo(MOTION_ENTER_DISTANCE_NORM);
  });

  it("P5-18 SCALE_IN", () => {
    const z = evaluateMotionProgress(
      { type: "SCALE_IN", startMs: 0, durationMs: 300 },
      0,
    );
    expect(z.ok && z.value.scale).toBeCloseTo(MOTION_SCALE_IN_INITIAL);
    const one = evaluateMotionProgress(
      { type: "SCALE_IN", startMs: 0, durationMs: 300 },
      1,
    );
    expect(one.ok && one.value.scale).toBeCloseTo(1);
  });

  it("P5-19 clamp <0", () => {
    expect(clampUnit(-0.5)).toBe(0);
    const r = evaluateMotionProgress(
      { type: "FADE_IN", startMs: 0, durationMs: 100 },
      -1,
    );
    expect(r.ok && r.value.opacity).toBe(0);
  });

  it("P5-20 clamp >1", () => {
    expect(clampUnit(1.5)).toBe(1);
    const r = evaluateMotionProgress(
      { type: "FADE_IN", startMs: 0, durationMs: 100 },
      2,
    );
    expect(r.ok && r.value.opacity).toBe(1);
  });

  it("P5-21 hidden clock no progress", () => {
    const clock = new IntroTimelineClock();
    clock.markOwnerVisible();
    clock.advance(100);
    clock.setCovered(true);
    const before = clock.snapshot().sceneElapsedMs;
    clock.advance(500);
    expect(clock.snapshot().sceneElapsedMs).toBe(before);
    const local = motionLocalProgress({
      sceneElapsedMs: before,
      startMs: 0,
      durationMs: 300,
    });
    expect(local).toBeCloseTo(before / 300);
  });

  it("P5-22 resume preserves elapsed", () => {
    const clock = new IntroTimelineClock();
    clock.markOwnerVisible();
    clock.advance(250);
    clock.setBackgrounded(true);
    clock.advance(1000);
    const paused = clock.snapshot().sceneElapsedMs;
    expect(paused).toBe(250);
    clock.resumeFromForeground();
    clock.advance(50);
    expect(clock.snapshot().sceneElapsedMs).toBe(300);
    const m = evaluateMotionAtSceneElapsed(
      { type: "FADE_IN", startMs: 0, durationMs: 300 },
      300,
    );
    expect(m.ok && m.value.complete).toBe(true);
  });

  it("P5-23 invalid motion fail-closed", () => {
    expect(validateMotionToken({ type: "SLIDE_LEFT", durationMs: 200 }).ok).toBe(
      false,
    );
    expect(
      evaluateMotionProgress({ type: "SLIDE_LEFT", startMs: 0, durationMs: 200 }, 0.5)
        .ok,
    ).toBe(false);
  });

  it("motion classification reported (not Owner-locked)", () => {
    expect(MOTION_ENTER_DISTANCE_CLASSIFICATION).toBe("IMPLEMENTATION_CHOICE");
    expect(MOTION_SCALE_IN_CLASSIFICATION).toBe("IMPLEMENTATION_CHOICE");
    expect(MOTION_EASING_CLASSIFICATION).toBe("IMPLEMENTATION_CHOICE");
    expect(MOTION_EASING).toBe("LINEAR");
  });
});

describe("R14-P5 transition", () => {
  it("P5-24 CUT", () => {
    const r = evaluateTransitionProgress({ type: "CUT", durationMs: 0 }, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // CUT duration 0 → local progress 1 immediately via elapsed path
    const at = evaluateTransitionAtElapsed({ type: "CUT", durationMs: 0 }, 0);
    expect(at.ok && at.value.complete).toBe(true);
    expect(at.ok && at.value.incomingOpacity).toBe(1);
    expect(at.ok && at.value.outgoingOpacity).toBe(0);
  });

  it("P5-25 FADE", () => {
    const r = evaluateTransitionProgress({ type: "FADE", durationMs: 400 }, 0.5);
    expect(r.ok && r.value.outgoingOpacity).toBeCloseTo(0.5);
    expect(r.ok && r.value.incomingOpacity).toBeCloseTo(0.5);
  });

  it("P5-26 SLIDE_LEFT", () => {
    const r = evaluateTransitionProgress(
      { type: "SLIDE_LEFT", durationMs: 300 },
      0.5,
    );
    expect(r.ok && r.value.outgoingTranslateXNorm).toBeCloseTo(-0.5);
    expect(r.ok && r.value.incomingTranslateXNorm).toBeCloseTo(0.5);
  });

  it("P5-27 SLIDE_RIGHT", () => {
    const r = evaluateTransitionProgress(
      { type: "SLIDE_RIGHT", durationMs: 300 },
      1,
    );
    expect(r.ok && r.value.outgoingTranslateXNorm).toBeCloseTo(1);
    expect(r.ok && r.value.incomingTranslateXNorm).toBeCloseTo(0);
  });

  it("P5-28 SLIDE_UP", () => {
    const r = evaluateTransitionProgress({ type: "SLIDE_UP", durationMs: 300 }, 0);
    expect(r.ok && r.value.incomingTranslateYNorm).toBeCloseTo(1);
  });

  it("P5-29 SLIDE_DOWN", () => {
    const r = evaluateTransitionProgress(
      { type: "SLIDE_DOWN", durationMs: 300 },
      0,
    );
    expect(r.ok && r.value.incomingTranslateYNorm).toBeCloseTo(-1);
  });

  it("P5-30 invalid transition fail-closed", () => {
    expect(validateTransitionToken({ type: "ZOOM", durationMs: 200 }).ok).toBe(
      false,
    );
  });

  it("P5-31 motion token rejected in transition", () => {
    expect(validateTransitionToken({ type: "FADE_IN", durationMs: 200 }).ok).toBe(
      false,
    );
    expect(
      evaluateTransitionProgress({ type: "FADE_IN", durationMs: 200 }, 0.5).ok,
    ).toBe(false);
  });

  it("P5-32 transition token rejected in motion", () => {
    expect(validateMotionToken({ type: "SLIDE_UP", durationMs: 200 }).ok).toBe(
      false,
    );
  });

  it("P5-33 timing inclusion rule deterministic", () => {
    expect(TRANSITION_DURATION_MODE).toBe("ADDITIONAL_TO_SCENE");
    expect(TRANSITION_DURATION_MODE_CLASSIFICATION).toBe(
      "EXISTING_PRODUCT_CONTRACT",
    );
    expect(INTRO_TIMELINE_POLICY.transitionDurationMode).toBe(
      "ADDITIONAL_TO_SCENE",
    );
  });
});

describe("R14-P5 CTA", () => {
  it("P5-34 NEXT exactly once", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(3, 0);
    const a = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "n1");
    expect(a.ok && a.applied).toBe(true);
    expect(gate.getSceneIndex()).toBe(1);
    const b = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "n1");
    expect(b.ok && !b.applied).toBe(true);
    expect(gate.getSceneIndex()).toBe(1);
  });

  it("P5-35 NEXT/timer race — token wins once", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(2, 0);
    const tap = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "scene0:NEXT");
    expect(tap.ok && tap.applied).toBe(true);
    // Simulated timer completion for same scene advancement identity
    const timer = gate.dispatch(
      { kind: "NEXT", sceneIndex: -1 },
      "scene0:NEXT",
    );
    expect(timer.ok && !timer.applied).toBe(true);
    expect(gate.getSceneIndex()).toBe(1);
  });

  it("P5-36 duplicate NEXT", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(3, 0);
    gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "a");
    const d = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "a");
    expect(d.ok && !d.applied).toBe(true);
  });

  it("P5-37 FINISH exactly once", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(1, 0);
    const a = gate.dispatch({ kind: "FINISH" }, "f1");
    expect(a.ok && a.applied).toBe(true);
    expect(gate.hasCompletionIntent()).toBe(true);
    const b = gate.dispatch({ kind: "FINISH" }, "f2");
    expect(b.ok && !b.applied).toBe(true);
  });

  it("P5-38 FINISH/Home-not-ready", () => {
    const h = evaluateIntroToHomeHandoff({
      introCompleteIntent: true,
      homePresentationReady: false,
    });
    expect(h.action).toBe("KEEP_LAST_INTRO_FRAME");
  });

  it("P5-39 FINISH/Home-ready", () => {
    const handoff = new HandoffOnceGate();
    const h = evaluateIntroToHomeHandoff({
      introCompleteIntent: true,
      homePresentationReady: true,
    });
    expect(h.action).toBe("HANDOFF");
    expect(handoff.tryFire()).toBe(true);
    expect(handoff.tryFire()).toBe(false);
  });

  it("P5-40 INTERNAL registry only", () => {
    for (const k of CTA_INTERNAL_DESTINATIONS) {
      expect(resolveCtaDestination(k).ok).toBe(true);
    }
    expect(listCtaDestinationKeys()).toEqual([...CTA_INTERNAL_DESTINATIONS]);
  });

  it("P5-41 raw URL rejected", () => {
    expect(rejectRawUrlDestination("https://evil.com")).toBe(true);
    expect(resolveCtaDestination("/market").ok).toBe(false);
    expect(resolveCtaDestination("https://x").ok).toBe(false);
    expect(mapDocumentCtaAction({ type: "https://x" }).ok).toBe(false);
  });

  it("P5-42 unknown key rejected", () => {
    expect(resolveCtaDestination("settings").ok).toBe(false);
    expect(
      mapDocumentCtaAction({
        type: "INTERNAL_DESTINATION",
        destination: "settings",
      }).ok,
    ).toBe(false);
  });

  it("P5-43 INTERNAL stages destination", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(1, 0);
    const r = gate.dispatch(
      { kind: "INTERNAL_DESTINATION", destination: "trade" },
      "i1",
    );
    expect(r.ok && r.applied).toBe(true);
    expect(gate.getStagedDestination()).toBe("trade");
    expect(gate.hasCompletionIntent()).toBe(true);
    expect(CTA_DESTINATION_TABLE.trade.routeMapping).toBe("/market");
  });

  it("P5-44 duplicate INTERNAL", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(1, 0);
    gate.dispatch(
      { kind: "INTERNAL_DESTINATION", destination: "chat" },
      "i1",
    );
    const d = gate.dispatch(
      { kind: "INTERNAL_DESTINATION", destination: "my" },
      "i2",
    );
    expect(d.ok && !d.applied).toBe(true);
    expect(gate.getStagedDestination()).toBe("chat");
  });

  it("P5-45 late CTA after DONE ignored", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(2, 0);
    gate.dispatch({ kind: "FINISH" }, "done");
    expect(gate.isDone()).toBe(true);
    const late = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "late");
    expect(late.ok && !late.applied).toBe(true);
    expect(gate.getSceneIndex()).toBe(0);
  });
});

describe("R14-P5 authority / adapters", () => {
  it("P5-46 Preview can consume same semantic module", () => {
    const api = createPreviewSemanticApi();
    expect(api.moduleId).toBe(PREVIEW_SEMANTIC_MODULE_ID);
    const m = api.evaluateMotionAtSceneElapsed(
      { type: "FADE_IN", startMs: 0, durationMs: 100 },
      50,
    );
    expect(m.ok && m.value.opacity).toBeCloseTo(0.5);
    expect(api.createTimelineClock()).toBeInstanceOf(IntroTimelineClock);
  });

  it("P5-47 native adapter contract consumes semantic output", () => {
    const native = createNativeAdapterContract();
    expect(native.moduleId).toBe(NATIVE_SEMANTIC_MODULE_ID);
    const el = native.buildElementSemantic({
      frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      intrinsicAspect: 1,
      fit: "CONTAIN",
      motion: { type: "SCALE_IN", startMs: 0, durationMs: 200 },
      sceneElapsedMs: 0,
    });
    expect(el.ok).toBe(true);
    if (!el.ok) return;
    expect(el.value.motion?.scale).toBeCloseTo(MOTION_SCALE_IN_INITIAL);
    expect(el.value.draw?.stretch).toBe(false);
  });

  it("P5-48 no duplicate geometry authority in compositor", () => {
    const geo = CANONICAL_AUTHORITY_ROWS.find((r) => r.concern === "normalized_geometry");
    expect(geo?.canonicalAuthority).toContain("execution/geometry");
    expect(geo?.action).toBe("DELEGATE");
  });

  it("P5-49 no duplicate motion registry", () => {
    expect(MOTION_TYPES_V1).toEqual([
      "NONE",
      "FADE_IN",
      "ENTER_LEFT",
      "ENTER_RIGHT",
      "ENTER_UP",
      "ENTER_DOWN",
      "SCALE_IN",
    ]);
    const row = CANONICAL_AUTHORITY_ROWS.find((r) => r.concern === "motion_registry");
    expect(row?.canonicalAuthority).toContain("registries/motion");
  });

  it("P5-50 no duplicate transition registry", () => {
    expect(TRANSITION_TYPES_V1).toEqual([
      "CUT",
      "FADE",
      "SLIDE_LEFT",
      "SLIDE_RIGHT",
      "SLIDE_UP",
      "SLIDE_DOWN",
    ]);
  });

  it("P5-51 no duplicate CTA registry", () => {
    expect(CTA_INTERNAL_DESTINATIONS).toEqual([
      "community",
      "trade",
      "food",
      "chat",
      "my",
    ]);
    const row = CANONICAL_AUTHORITY_ROWS.find((r) => r.concern === "cta_registry");
    expect(row?.canonicalAuthority).toContain("registries/cta");
  });

  it("P5 execution SSOT retained; P7 activates production presentation", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(true);
    expect(getStartupCompositorActivation().productionPresentationActive).toBe(
      true,
    );
    expect(getStartupCompositorActivation().phase).toBe(
      "P7_NATIVE_LIFECYCLE_INTEGRATION",
    );
  });

  it("P5 static: no IntroSurface / no native host wiring in execution", () => {
    const root = join(process.cwd(), "lib/startup-compositor/execution");
    const files = readdirSync(root).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(join(root, f), "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(src).not.toMatch(
        /IntroSurface|IntroDialog|IntroOverlay|IntroViewController/,
      );
    }
    expect(statSync(join(process.cwd(), "android/app/src/main/java")).isDirectory()).toBe(
      true,
    );
  });

  it("fitIntrinsicIntoMaxBox CONTAIN delegates shared engine", () => {
    const a = fitIntrinsicIntoMaxBox({
      intrinsic: { width: 100, height: 50 },
      maxW: 0.82,
      maxH: 0.55,
      mode: "CONTAIN",
    });
    const b = containMediaFrame({ width: 100, height: 50 }, 0.82, 0.55);
    expect(a).toEqual(b);
  });
});
