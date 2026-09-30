/**
 * REBUILD 14 — R14-P4 Intro shared semantic render / timeline (T51–T120+).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

import {
  BASE_COMPOSITION_ASPECT,
  DEFAULT_MOTION,
  DEFAULT_TRANSITION_CUT,
  DEFAULT_TRANSITION_FADE,
  createEmptyV0Document,
  type ElementV1,
  type IntroDocumentV1,
  type SceneV1,
} from "@/lib/intro/contracts/document";
import {
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
  StartupCompositorEngine,
  buildIntroRenderModel,
  parseIntroDocument,
  parseStartupPackageEnvelope,
  createScene,
  renameScene,
  duplicateScene,
  reorderScenes,
  deleteScene,
  replaceElementMedia,
  centerNormalizedFrame,
  isNormalizedFrameInRange,
  containMediaFrame,
  defaultImageInsertFrame,
  defaultLogoInsertFrame,
  IntroTimelineClock,
  IntroCtaActionGate,
  mapDocumentCtaAction,
  rejectRawUrlDestination,
  evaluateSsToIntroHandoff,
  evaluateIntroToHomeHandoff,
  introRenderModelHasEditorChrome,
  INTRO_MEDIA_FORMAT_CONTRACTS,
  SCENE_BACKGROUND_GIF_SUPPORTED,
  SCENE_BACKGROUND_VIDEO_SUPPORTED,
  INTRO_FAILURE_FORBIDDEN_SURFACES,
  INTRO_MEDIA_FALLBACK_FORBIDDEN,
  policyForInvalidIntroBeforeVisibility,
  policyForLaterSceneFailure,
  validateMotionToken,
  validateTransitionToken,
  type MediaAvailabilityEntry,
  type StartupPackageEnvelope,
} from "@/lib/startup-compositor";

const ROOT = join(__dirname, "../../..");
const ANDROID_HOST = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorHost.java",
);
const IOS_HOST = join(ROOT, "ios/App/App/DibayStartupCompositorHost.swift");
const MAIN_ACTIVITY = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/MainActivity.java",
);
const IOS_ROOT_VC = join(ROOT, "ios/App/App/DibayRootBridgeViewController.swift");

function hex64(ch: string): string {
  return ch.repeat(64);
}

function baseSystemStart() {
  return {
    backgroundColor: "#0B1B3A",
    backgroundImageMediaId: null,
    brandAssetEnabled: true,
    brandAssetMediaId: "logo-1",
    brandSizePreset: "M",
    brandXNorm: 0.5,
    brandYNorm: 0.45,
    minVisibleMs: 1500,
  };
}

function makeEnvelope(intro: unknown, mediaExtra: { mediaId: string; integrityHex: string }[] = []): StartupPackageEnvelope {
  const raw = {
    schemaVersion: 14,
    generationId: "G1",
    contentClass: "OWNER",
    systemStart: baseSystemStart(),
    intro,
    mediaManifest: [
      { mediaId: "logo-1", integrityHex: hex64("a") },
      { mediaId: "img-1", integrityHex: hex64("c") },
      { mediaId: "gif-1", integrityHex: hex64("d") },
      { mediaId: "vid-1", integrityHex: hex64("e") },
      ...mediaExtra,
    ],
    capabilityVersion: 1,
    integrity: hex64("b"),
  };
  const r = parseStartupPackageEnvelope(raw);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function avail(
  entries: Record<string, Partial<MediaAvailabilityEntry> & { integrityHex: string }>,
): Record<string, MediaAvailabilityEntry> {
  const out: Record<string, MediaAvailabilityEntry> = {};
  for (const [id, e] of Object.entries(entries)) {
    out[id] = {
      integrityHex: e.integrityHex,
      intrinsicAspect: e.intrinsicAspect ?? 1,
      bytesPresent: e.bytesPresent ?? true,
    };
  }
  return out;
}

const defaultAvail = () =>
  avail({
    "logo-1": { integrityHex: hex64("a"), intrinsicAspect: 1 },
    "img-1": { integrityHex: hex64("c"), intrinsicAspect: 16 / 9 },
    "gif-1": { integrityHex: hex64("d"), intrinsicAspect: 1 },
    "vid-1": { integrityHex: hex64("e"), intrinsicAspect: 16 / 9 },
  });

function imageEl(id: string, mediaId = "img-1"): ElementV1 {
  return {
    id,
    type: "IMAGE",
    frame: { x: 0.1, y: 0.2, w: 0.8, h: 0.3 },
    zIndex: 1,
    visible: true,
    opacity: 1,
    motion: { type: "FADE_IN", startMs: 0, durationMs: 300 },
    payload: { mediaId, fit: "CONTAIN" },
  };
}

function logoEl(id: string, mediaId = "logo-1"): ElementV1 {
  return {
    id,
    type: "LOGO",
    frame: { x: 0.3, y: 0.1, w: 0.4, h: 0.15 },
    zIndex: 2,
    visible: true,
    opacity: 1,
    motion: DEFAULT_MOTION,
    payload: { mediaId, fit: "CONTAIN" },
  };
}

function textEl(id: string): ElementV1 {
  return {
    id,
    type: "TEXT",
    frame: { x: 0.08, y: 0.5, w: 0.84, h: 0.1 },
    zIndex: 3,
    visible: true,
    opacity: 1,
    motion: { type: "ENTER_UP", startMs: 100, durationMs: 300 },
    payload: {
      text: "Hello",
      color: "#FFFFFF",
      fontSizeNorm: 0.045,
      align: "center",
      weight: "bold",
    },
  };
}

function ctaEl(
  id: string,
  action:
    | { type: "NEXT_SCENE" }
    | { type: "FINISH_INTRO" }
    | { type: "INTERNAL_DESTINATION"; destination: "community" | "trade" | "food" | "chat" | "my" },
): ElementV1 {
  return {
    id,
    type: "CTA",
    frame: { x: 0.2, y: 0.75, w: 0.6, h: 0.08 },
    zIndex: 4,
    visible: true,
    opacity: 1,
    motion: { type: "SCALE_IN", startMs: 200, durationMs: 280 },
    payload: {
      label: "Go",
      action,
      backgroundColor: "#FFFFFF",
      textColor: "#0B1B3A",
    },
  };
}

function scene(id: string, elements: ElementV1[], transition = DEFAULT_TRANSITION_CUT): SceneV1 {
  return {
    id,
    name: id,
    durationMs: 2500,
    background: { type: "COLOR", color: "#0B1B3A" },
    transition,
    elements,
  };
}

function doc(scenes: SceneV1[]): IntroDocumentV1 {
  return {
    schemaVersion: 1,
    title: "Intro Test",
    compositionAspect: BASE_COMPOSITION_ASPECT,
    scenes,
  };
}

describe("R14-P4 Intro shared render / timeline", () => {
  beforeEach(() => {
    StartupCompositorEngine.resetRegistryForTests();
  });

  // —— INTRO DOCUMENT ——
  it("T51 intro.present=false valid", () => {
    const env = makeEnvelope({ present: false });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.present).toBe(false);
    expect(r.value.kind).toBe("INTRO_ABSENT");
  });

  it("T52 intro.present=true requires valid document", () => {
    const env = makeEnvelope({ present: true, document: { schemaVersion: 1 } });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    expect(r.ok).toBe(false);
  });

  it("T53 ordered scenes deterministic", () => {
    const d = doc([
      scene("s1", [textEl("t1")]),
      scene("s2", [textEl("t2")]),
      scene("s3", [textEl("t3")]),
    ]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "INTRO_PHASE") return;
    expect(r.value.scenes.map((s) => s.sceneId)).toEqual(["s1", "s2", "s3"]);
    expect(r.value.scenes.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("T54 duplicate scene IDs invalid", () => {
    const d = doc([scene("dup", [textEl("t1")]), scene("dup", [textEl("t2")])]);
    expect(parseIntroDocument(d).ok).toBe(false);
  });

  it("T55 empty Intro policy exact", () => {
    const empty = {
      schemaVersion: 1,
      title: "X",
      compositionAspect: BASE_COMPOSITION_ASPECT,
      scenes: [],
    };
    const p = parseIntroDocument(empty);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("intro_empty_scenes");
  });

  // —— ELEMENTS ——
  it("T56 IMAGE valid", () => {
    const d = doc([scene("s1", [imageEl("i1")])]);
    expect(parseIntroDocument(d).ok).toBe(true);
  });

  it("T57 LOGO valid", () => {
    const d = doc([scene("s1", [logoEl("l1")])]);
    expect(parseIntroDocument(d).ok).toBe(true);
  });

  it("T58 TEXT valid", () => {
    const d = doc([scene("s1", [textEl("t1")])]);
    expect(parseIntroDocument(d).ok).toBe(true);
  });

  it("T59 CTA valid", () => {
    const d = doc([scene("s1", [ctaEl("c1", { type: "NEXT_SCENE" })])]);
    expect(parseIntroDocument(d).ok).toBe(true);
  });

  it("T60 unknown element fail-closed", () => {
    const d = doc([
      {
        ...scene("s1", []),
        elements: [
          {
            id: "x",
            type: "BANNER" as never,
            frame: { x: 0, y: 0, w: 1, h: 1 },
            zIndex: 1,
            visible: true,
            opacity: 1,
            motion: DEFAULT_MOTION,
            payload: { text: "x", color: "#FFFFFF", fontSizeNorm: 0.04, align: "center", weight: "regular" },
          },
        ],
      },
    ]);
    const p = parseIntroDocument(d);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("unknown_element");
  });

  // —— GEOMETRY ——
  it("T61 normalized frame valid", () => {
    expect(isNormalizedFrameInRange({ x: 0.1, y: 0.2, w: 0.5, h: 0.3 })).toBe(true);
  });

  it("T62 out-of-range geometry invalid", () => {
    expect(isNormalizedFrameInRange({ x: -0.1, y: 0, w: 0.5, h: 0.3 })).toBe(false);
    expect(isNormalizedFrameInRange({ x: 0.8, y: 0, w: 0.5, h: 0.3 })).toBe(false);
  });

  it("T63 IMAGE aspect preserved", () => {
    const f = containMediaFrame({ width: 1600, height: 900 }, 0.82, 0.55);
    expect(f.w / f.h).toBeCloseTo(1600 / 900, 5);
  });

  it("T64 LOGO aspect preserved", () => {
    const f = defaultLogoInsertFrame({ width: 200, height: 100 });
    expect(f.w / f.h).toBeCloseTo(2, 5);
  });

  it("T65 CONTAIN center", () => {
    const f = defaultImageInsertFrame({ width: 100, height: 100 });
    const c = centerNormalizedFrame(f.w, f.h);
    expect(c.x).toBeCloseTo((1 - f.w) / 2, 5);
    expect(c.y).toBeCloseTo((1 - f.h) / 2, 5);
  });

  it("T66–T68 replace preserves geometry/elementId/motion", () => {
    const d = doc([scene("s1", [imageEl("i1", "img-1")])]);
    const r = replaceElementMedia(d, "i1", "logo-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.element.id).toBe("i1");
    expect(r.element.frame).toEqual(d.scenes[0]!.elements[0]!.frame);
    expect(r.element.motion).toEqual(d.scenes[0]!.elements[0]!.motion);
    expect((r.element.payload as { mediaId: string }).mediaId).toBe("logo-1");
  });

  // —— MEDIA ——
  it("T69 active-generation image valid", () => {
    const d = doc([scene("s1", [imageEl("i1")])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    expect(r.ok).toBe(true);
  });

  it("T70 foreign generation rejected", () => {
    const d = doc([scene("s1", [imageEl("i1", "foreign")])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: avail({ foreign: { integrityHex: hex64("f") } }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("media_not_in_active_generation_manifest");
  });

  it("T71 missing required media fail", () => {
    const d = doc([scene("s1", [imageEl("i1")])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: {},
    });
    expect(r.ok).toBe(false);
  });

  it("T72–T74 PNG/JPG/WebP contracts", () => {
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.PNG.contractImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.JPG.contractImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.WEBP.contractImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.PNG.nativePlaybackProven).toBe(false);
  });

  it("T75 GIF semantic contract ≠ native playback", () => {
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.GIF.contractImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.GIF.sharedTimelineImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.GIF.nativePlaybackProven).toBe(false);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.GIF.notes).toMatch(/OWNER_VISIBLE/);
  });

  it("T76 MP4 semantic contract ≠ native playback", () => {
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.MP4.contractImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.MP4.sharedTimelineImplemented).toBe(true);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.MP4.nativePlaybackProven).toBe(false);
    expect(INTRO_MEDIA_FORMAT_CONTRACTS.MP4.notes).toMatch(/muted|Audio/i);
  });

  // —— TRANSITION ——
  it("T77–T82 transition registry tokens", () => {
    for (const t of ["CUT", "FADE", "SLIDE_LEFT", "SLIDE_RIGHT", "SLIDE_UP", "SLIDE_DOWN"] as const) {
      expect(validateTransitionToken({ type: t, durationMs: t === "CUT" ? 0 : 280 }).ok).toBe(true);
    }
  });

  it("T83 unsupported transition fail", () => {
    expect(validateTransitionToken({ type: "ZOOM", durationMs: 200 }).ok).toBe(false);
    const d = doc([
      {
        ...scene("s1", [textEl("t1")]),
        transition: { type: "ZOOM" as never, durationMs: 200 },
      },
    ]);
    expect(parseIntroDocument(d).ok).toBe(false);
  });

  // —— MOTION ——
  it("T84–T90 motion registry tokens", () => {
    for (const t of [
      "NONE",
      "FADE_IN",
      "ENTER_LEFT",
      "ENTER_RIGHT",
      "ENTER_UP",
      "ENTER_DOWN",
      "SCALE_IN",
    ] as const) {
      expect(
        validateMotionToken({
          type: t,
          startMs: 0,
          durationMs: t === "NONE" ? 0 : 300,
        }).ok,
      ).toBe(true);
    }
  });

  it("T91 Scene SLIDE token rejected as motion", () => {
    expect(validateMotionToken({ type: "SLIDE_LEFT", startMs: 0, durationMs: 300 }).ok).toBe(false);
    const d = doc([
      scene("s1", [
        {
          ...textEl("t1"),
          motion: { type: "SLIDE_LEFT" as never, startMs: 0, durationMs: 300 },
        },
      ]),
    ]);
    const p = parseIntroDocument(d);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/motion_slot_rejected|unsupported_motion|invalid_motion/);
  });

  it("T92 motion token rejected as transition where invalid", () => {
    expect(validateTransitionToken({ type: "FADE_IN", durationMs: 200 }).ok).toBe(false);
    const d = doc([
      {
        ...scene("s1", [textEl("t1")]),
        transition: { type: "FADE_IN" as never, durationMs: 200 },
      },
    ]);
    expect(parseIntroDocument(d).ok).toBe(false);
  });

  // —— CTA ——
  it("T93 NEXT one action one scene", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(3, 0);
    const r = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "tok1");
    expect(r.ok && r.applied).toBe(true);
    expect(gate.getSceneIndex()).toBe(1);
  });

  it("T94 duplicate NEXT idempotency", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(3, 0);
    gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "tok1");
    const r2 = gate.dispatch({ kind: "NEXT", sceneIndex: -1 }, "tok1");
    expect(r2.ok && !r2.applied).toBe(true);
    expect(gate.getSceneIndex()).toBe(1);
  });

  it("T95 FINISH produces completion intent", () => {
    const gate = new IntroCtaActionGate();
    gate.bind(2, 0);
    const r = gate.dispatch({ kind: "FINISH" }, "f1");
    expect(r.ok && r.applied).toBe(true);
    expect(gate.hasCompletionIntent()).toBe(true);
  });

  it("T96 FINISH before HOME_READY keeps last frame", () => {
    const eng = StartupCompositorEngine.getOrCreate("p4-t96");
    const d = doc([scene("s1", [ctaEl("c1", { type: "FINISH_INTRO" })])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const built = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
      scene1Paintable: true,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    eng.bindIntroPhaseModel(built.value);
    eng.dispatchIntroCta({ kind: "FINISH" }, "finish-1");
    expect(eng.hasIntroCompleteIntent()).toBe(true);
    expect(eng.isRetainingLastIntroFrame()).toBe(true);
    expect(eng.getPhase()).not.toBe("HANDOFF");
  });

  it("T97 INTERNAL registry valid", () => {
    for (const dest of ["community", "trade", "food", "chat", "my"] as const) {
      const r = mapDocumentCtaAction({ type: "INTERNAL_DESTINATION", destination: dest });
      expect(r.ok).toBe(true);
    }
  });

  it("T98 raw URL rejected", () => {
    expect(rejectRawUrlDestination("https://evil.com")).toBe(true);
    expect(rejectRawUrlDestination("/market")).toBe(true);
    expect(mapDocumentCtaAction({ type: "https://x.com" }).ok).toBe(false);
  });

  it("T99 unknown destination rejected", () => {
    const r = mapDocumentCtaAction({
      type: "INTERNAL_DESTINATION",
      destination: "settings",
    });
    expect(r.ok).toBe(false);
  });

  // —— VISIBILITY / TIMELINE ——
  it("T100–T104 timeline starts only at OWNER_VISIBLE", () => {
    const clock = new IntroTimelineClock();
    for (const step of [
      "INTRO_IR_READY",
      "INTRO_RENDER_READY",
      "INTRO_PAINTABLE",
      "INTRO_FIRST_MEANINGFUL_FRAME_COMMITTED",
    ] as const) {
      clock.setVisibility(step);
      clock.advance(500);
      expect(clock.snapshot().running).toBe(false);
      expect(clock.snapshot().totalConsumedMs).toBe(0);
    }
    const started = clock.markOwnerVisible();
    expect(started.started).toBe(true);
    clock.advance(400);
    expect(clock.snapshot().running).toBe(true);
    expect(clock.snapshot().totalConsumedMs).toBe(400);
  });

  it("T105 duplicate OWNER_VISIBLE does not restart", () => {
    const clock = new IntroTimelineClock();
    clock.markOwnerVisible();
    clock.advance(200);
    const again = clock.markOwnerVisible();
    expect(again.restarted).toBe(false);
    expect(again.started).toBe(false);
    expect(clock.snapshot().sceneElapsedMs).toBe(200);
  });

  it("T106–T107 hidden/background time not consumed", () => {
    const clock = new IntroTimelineClock();
    clock.markOwnerVisible();
    clock.setCovered(true);
    clock.advance(1000);
    expect(clock.snapshot().totalConsumedMs).toBe(0);
    clock.setCovered(false);
    clock.setBackgrounded(true);
    clock.advance(1000);
    expect(clock.snapshot().totalConsumedMs).toBe(0);
  });

  it("T108 resume continues canonical timeline", () => {
    const clock = new IntroTimelineClock();
    clock.markOwnerVisible();
    clock.advance(300);
    clock.setBackgrounded(true);
    clock.advance(500);
    clock.resumeFromForeground();
    clock.advance(200);
    expect(clock.snapshot().totalConsumedMs).toBe(500);
  });

  // —— HANDOFF ——
  it("T109 SS retained until Intro Scene1 ready", () => {
    const g = evaluateSsToIntroHandoff({
      systemStartMinVisibleElapsed: true,
      introScene1Paintable: false,
      introPresent: true,
    });
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.reason).toBe("intro_scene1_not_paintable");
  });

  it("T110 no blank SS→Intro when ready", () => {
    const g = evaluateSsToIntroHandoff({
      systemStartMinVisibleElapsed: true,
      introScene1Paintable: true,
      introPresent: true,
    });
    expect(g.allowed).toBe(true);
    if (g.allowed) expect(g.retainSystemStartUntilIntroFrame).toBe(true);
  });

  it("T111 Intro completion + Home not ready keeps last frame", () => {
    const r = evaluateIntroToHomeHandoff({
      introCompleteIntent: true,
      homePresentationReady: false,
    });
    expect(r.action).toBe("KEEP_LAST_INTRO_FRAME");
  });

  it("T112–T113 Home ready triggers one handoff; duplicate ignored", () => {
    const eng = StartupCompositorEngine.getOrCreate("p4-handoff");
    const d = doc([scene("s1", [ctaEl("c1", { type: "FINISH_INTRO" })])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const built = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    if (!built.ok) throw new Error("build fail");
    eng.bindIntroPhaseModel(built.value);
    eng.dispatchIntroCta({ kind: "FINISH" }, "f");
    expect(eng.isRetainingLastIntroFrame()).toBe(true);
    eng.ingestHomePresentationReady("test");
    expect(eng.getPhase()).toBe("HANDOFF");
    const again = eng.requestHandoff();
    expect(again.ok).toBe(true);
    expect(eng.getPhase()).toBe("HANDOFF");
  });

  // —— FAILURE ——
  it("T114 invalid Intro remains SS", () => {
    expect(policyForInvalidIntroBeforeVisibility().action).toBe("REMAIN_SS_SKIP_INTRO");
  });

  it("T115–T116 later scene failure no error board", () => {
    expect(policyForLaterSceneFailure().action).toBe("KEEP_LAST_GOOD_SCENE");
    for (const s of INTRO_FAILURE_FORBIDDEN_SURFACES) {
      expect(s).not.toBe("IntroSurface");
    }
  });

  it("T117–T119 no network/cross-gen/bootstrap fallback", () => {
    expect(INTRO_MEDIA_FALLBACK_FORBIDDEN).toEqual(
      expect.arrayContaining([
        "cross_generation",
        "network",
        "bootstrap_after_owner",
        "app_bundle_replacement",
      ]),
    );
  });

  it("T120 no separate Intro presentation surface", () => {
    const d = doc([scene("s1", [textEl("t1")])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const r = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "INTRO_PHASE") return;
    expect(r.value.presentationSurface).toBe("COMPOSITOR_PHASE_ONLY");
    expect(r.value.hasEditorChrome).toBe(false);
    expect(introRenderModelHasEditorChrome(r.value)).toBe(false);
  });

  // —— SCENE OPS / PATHS / ENGINE ——
  it("scene CRUD ops semantic (no Admin)", () => {
    let d = createEmptyV0Document("Ops");
    const c = createScene(d, { name: "Two" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    d = c.value;
    const ren = renameScene(d, d.scenes[1]!.id, "Renamed");
    expect(ren.ok).toBe(true);
    if (!ren.ok) return;
    d = ren.value;
    const dup = duplicateScene(d, d.scenes[0]!.id);
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    d = dup.value;
    const ids = d.scenes.map((s) => s.id);
    const reo = reorderScenes(d, [...ids].reverse());
    expect(reo.ok).toBe(true);
    if (!reo.ok) return;
    d = reo.value;
    const del = deleteScene(d, d.scenes[0]!.id);
    expect(del.ok).toBe(true);
  });

  it("intro.present=false path does not require document", () => {
    const env = makeEnvelope({ present: false });
    const eng = StartupCompositorEngine.getOrCreate("absent");
    const built = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(eng.bindIntroPhaseModel(built.value).ok).toBe(true);
    expect(eng.trySsToIntroTransition({
      systemStartMinVisibleElapsed: true,
      introScene1Paintable: true,
    }).ok).toBe(false);
  });

  it("engine Intro visibility ladder + Production blocks OWNER_VISIBLE", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(false);
    const d = doc([scene("s1", [textEl("t1")])]);
    const env = makeEnvelope({ present: true, document: d as unknown as Record<string, unknown> });
    const built = buildIntroRenderModel({
      intro: env.intro,
      envelope: env,
      availability: defaultAvail(),
    });
    if (!built.ok) throw new Error("build");
    const eng = StartupCompositorEngine.getOrCreate("vis");
    eng.bindIntroPhaseModel(built.value);
    expect(eng.advanceIntroVisibility("INTRO_RENDER_READY").ok).toBe(true);
    expect(eng.advanceIntroVisibility("INTRO_PAINTABLE").ok).toBe(true);
    expect(eng.advanceIntroVisibility("INTRO_FIRST_MEANINGFUL_FRAME_COMMITTED").ok).toBe(true);
    expect(eng.advanceIntroVisibility("INTRO_OWNER_VISIBLE").ok).toBe(false);
    expect(
      eng.advanceIntroVisibility("INTRO_OWNER_VISIBLE", {
        testHarnessAllowOwnerVisibleSemantic: true,
      }).ok,
    ).toBe(true);
    expect(eng.getIntroTimeline().snapshot().running).toBe(true);
  });

  it("scene background GIF/VIDEO not supported by document slot", () => {
    expect(SCENE_BACKGROUND_GIF_SUPPORTED).toBe(false);
    expect(SCENE_BACKGROUND_VIDEO_SUPPORTED).toBe(false);
  });

  it("FADE transition accepted on scene", () => {
    const d = doc([scene("s1", [textEl("t1")], DEFAULT_TRANSITION_FADE)]);
    expect(parseIntroDocument(d).ok).toBe(true);
  });

  it("static ownership: no IntroSurface/Dialog/Overlay/VC in compositor", () => {
    const stripComments = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
    const introDir = join(ROOT, "lib/startup-compositor");
    const files = [
      "intro/render.ts",
      "intro/render-model.ts",
      "intro/timeline.ts",
      "runtime/engine.ts",
      "index.ts",
    ];
    for (const f of files) {
      const src = stripComments(readFileSync(join(introDir, f), "utf8"));
      expect(src).not.toMatch(/IntroSurface|IntroDialog|IntroOverlay|IntroViewController|SceneSurface/);
      expect(src).not.toMatch(/WebView.*hide|CapSplash|capacitor.*Splash/i);
    }
  });

  it("native hosts unwired; Production false", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(false);
    const main = readFileSync(MAIN_ACTIVITY, "utf8");
    expect(main).not.toMatch(/DibayStartupCompositorHost/);
    if (existsSync(IOS_ROOT_VC)) {
      const ios = readFileSync(IOS_ROOT_VC, "utf8");
      expect(ios).not.toMatch(/DibayStartupCompositorHost/);
    }
    const android = readFileSync(ANDROID_HOST, "utf8");
    const iosHost = readFileSync(IOS_HOST, "utf8");
    expect(android).toMatch(/UNWIRED|dormant|PRODUCTION_PRESENTATION_ACTIVE = false/);
    expect(iosHost).toMatch(/UNWIRED|dormant|PRODUCTION_PRESENTATION_ACTIVE = false/);
  });
});
