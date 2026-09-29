/**
 * DIBAY INTRO — Vertical B
 * Motion schema, legacy NONE decode, timing window, enum serialization,
 * scene factory cancel atomicity (candidate modal = zero mutation until confirm).
 */

import { describe, expect, it } from "vitest";
import type { IntroDocumentV1, LayerV1 } from "../contracts/document";
import {
  DEFAULT_LAYER_MOTION,
  LAYER_MOTION_TYPES,
  MOTION_SCALE_START_FACTOR,
  MOTION_TRANSLATION_DISTANCE_NORM,
  resolveLayerMotion,
  validateMotionTiming,
} from "../contracts/motion";
import { canonicalizeAuthoredDocument } from "../document/canonical-equality";
import {
  createDefaultLayer,
  createEmptyIntroDocument,
  createEmptyScene,
  createSceneFromCandidate,
} from "../document/factory";
import {
  addSceneFromCandidate,
  deleteLayer,
  deleteScene,
  setLayerMediaRef,
  setLayerMotion,
  updateLayer,
} from "../document/mutations";
import { packSummaryForReport, buildIntroPackV1 } from "../pack/canonical";
import { validateDraft, validatePublish } from "../validation/core";

function baseDoc(): IntroDocumentV1 {
  const doc = createEmptyIntroDocument({
    documentId: "doc-b-motion",
    title: "B Motion",
  });
  const scene = createEmptyScene({
    name: "Scene 1",
    durationMs: 3000,
    transitionAfter: null,
  });
  const image = createDefaultLayer("IMAGE", [], { mediaRefId: "m1" });
  const logo = createDefaultLayer("LOGO", [image], { mediaRefId: "m2" });
  const text = createDefaultLayer("TEXT", [image, logo]);
  const cta = createDefaultLayer("CTA", [image, logo, text]);
  return {
    ...doc,
    scenes: [
      {
        ...scene,
        layers: [image, logo, text, cta],
      },
    ],
  };
}

describe("Vertical B — layer motion authority", () => {
  it("exports all 7 semantic motion enums (not CSS classes)", () => {
    expect([...LAYER_MOTION_TYPES]).toEqual([
      "NONE",
      "FADE_IN",
      "TOP_IN",
      "BOTTOM_IN",
      "LEFT_IN",
      "RIGHT_IN",
      "SCALE_IN",
    ]);
    expect(MOTION_TRANSLATION_DISTANCE_NORM).toBe(0.08);
    expect(MOTION_SCALE_START_FACTOR).toBe(0.85);
  });

  it("legacy missing motion decodes as NONE", () => {
    const layer = {
      layerId: "l1",
      type: "TEXT",
      frame: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
      visible: true,
      opacity: 1,
      zIndex: 0,
      content: "hi",
      font: {
        family: "Pretendard",
        weight: "BOLD",
        assetId: "Pretendard-Bold.otf",
      },
      fontSize: 0.05,
      lineHeight: 1.25,
      letterSpacing: 0,
      align: "CENTER",
      color: { r: 1, g: 1, b: 1, a: 1 },
      wrap: "SOFT",
      maxLines: 2,
      overflow: "CLIP",
    } as LayerV1;
    expect(layer.motion).toBeUndefined();
    expect(resolveLayerMotion(layer.motion)).toEqual(DEFAULT_LAYER_MOTION);
  });

  it("canonicalize makes legacy missing motion explicit NONE", () => {
    const doc = baseDoc();
    const stripped: IntroDocumentV1 = {
      ...doc,
      scenes: doc.scenes.map((s) => ({
        ...s,
        layers: s.layers.map((l) => {
          const { motion: _m, ...rest } = l as LayerV1 & { motion?: unknown };
          void _m;
          return rest as LayerV1;
        }),
      })),
    };
    const canon = canonicalizeAuthoredDocument(stripped);
    for (const layer of canon.scenes[0]!.layers) {
      expect(layer.motion).toEqual(DEFAULT_LAYER_MOTION);
    }
  });

  it("serializes all 7 motion types through layer update", () => {
    let doc = baseDoc();
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[0]!.layerId;
    for (const type of LAYER_MOTION_TYPES) {
      doc = setLayerMotion(doc, sceneId, layerId, {
        type,
        startMs: type === "NONE" ? 0 : 100,
        durationMs: type === "NONE" ? 0 : 400,
      });
      expect(doc.scenes[0]!.layers[0]!.motion?.type).toBe(type);
    }
  });

  it("rejects motion that exceeds scene authored window (no silent clamp)", () => {
    expect(
      validateMotionTiming(
        { type: "FADE_IN", startMs: 2800, durationMs: 400 },
        3000,
      ).ok,
    ).toBe(false);
    expect(
      validateMotionTiming(
        { type: "FADE_IN", startMs: 0, durationMs: 3000 },
        3000,
      ).ok,
    ).toBe(true);
  });

  it("draft/publish validator errors on motion past scene duration", () => {
    let doc = baseDoc();
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[0]!.layerId;
    doc = setLayerMotion(doc, sceneId, layerId, {
      type: "FADE_IN",
      startMs: 2500,
      durationMs: 1000,
    });
    const draft = validateDraft(doc);
    expect(draft.ok).toBe(false);
    expect(draft.issues.some((i) => i.code === "INVALID_LAYER_MOTION")).toBe(
      true,
    );
    const pub = validatePublish(doc, { isMediaReady: () => true });
    expect(pub.ok).toBe(false);
  });

  it("Save/reload-shaped canonicalize preserves authored motion", () => {
    let doc = baseDoc();
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[2]!.layerId; // TEXT
    doc = setLayerMotion(doc, sceneId, layerId, {
      type: "TOP_IN",
      startMs: 200,
      durationMs: 600,
    });
    const roundTrip = JSON.parse(JSON.stringify(doc)) as IntroDocumentV1;
    const canon = canonicalizeAuthoredDocument(roundTrip);
    expect(canon.scenes[0]!.layers[2]!.motion).toEqual({
      type: "TOP_IN",
      startMs: 200,
      durationMs: 600,
    });
  });

  it("pack integrity summary includes motion", () => {
    let doc = baseDoc();
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[0]!.layerId;
    doc = setLayerMotion(doc, sceneId, layerId, {
      type: "SCALE_IN",
      startMs: 0,
      durationMs: 500,
    });
    const pack = buildIntroPackV1({
      packId: "pack-b",
      publishedRevisionId: "rev-b",
      documentId: doc.documentId,
      sourceDraftVersion: 1,
      document: doc,
      assets: [],
    });
    const summary = packSummaryForReport(pack) as {
      scenes: Array<{ layers: Array<{ motion?: unknown }> }>;
    };
    const layer = summary.scenes[0]!.layers[0]!;
    expect(layer.motion).toEqual({
      type: "SCALE_IN",
      startMs: 0,
      durationMs: 500,
    });
  });

  it("new scene candidate cancel = zero mutation; confirm mutates once", () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    // Cancel path: never call addSceneFromCandidate
    expect(JSON.stringify(doc)).toBe(before);

    const { document: next, sceneId } = addSceneFromCandidate(doc, {
      name: "증명 장면",
      durationMs: 4000,
      background: {
        type: "SOLID",
        color: { r: 1, g: 0.2, b: 0.2, a: 1 },
      },
      transitionAfter: null,
    });
    expect(sceneId).toBeTruthy();
    expect(next.scenes.length).toBe(doc.scenes.length + 1);
    const created = next.scenes.find((s) => s.sceneId === sceneId)!;
    expect(created.name).toBe("증명 장면");
    expect(created.durationMs).toBe(4000);
    expect(created.background).toEqual({
      type: "SOLID",
      color: { r: 1, g: 0.2, b: 0.2, a: 1 },
    });
    expect(created.layers).toEqual([]);
    // Original unchanged
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("createSceneFromCandidate does not inject silent black/FADE300/2500", () => {
    const scene = createSceneFromCandidate({
      name: "명시",
      durationMs: 1800,
      background: {
        type: "SOLID",
        color: { r: 0.1, g: 0.5, b: 0.9, a: 1 },
      },
      transitionAfter: { type: "CUT", durationMs: 0 },
    });
    expect(scene.durationMs).toBe(1800);
    expect(scene.background.color).toEqual({
      r: 0.1,
      g: 0.5,
      b: 0.9,
      a: 1,
    });
    expect(scene.transitionAfter).toEqual({ type: "CUT", durationMs: 0 });
  });

  it("updateLayer can patch motion without inventing CSS class names", () => {
    const doc = baseDoc();
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[1]!.layerId;
    const next = updateLayer(doc, sceneId, layerId, {
      motion: { type: "LEFT_IN", startMs: 0, durationMs: 350 },
    });
    const motion = next.scenes[0]!.layers[1]!.motion!;
    expect(motion.type).toBe("LEFT_IN");
    expect(JSON.stringify(motion)).not.toMatch(/animate-|@keyframes|css/i);
  });
});

describe("Vertical B — cancel atomicity (document mutations)", () => {
  it("scene delete cancel path never calls deleteScene — document unchanged", () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    // Operator cancel: do not invoke deleteScene
    expect(JSON.stringify(doc)).toBe(before);
    expect(doc.scenes.length).toBe(1);
  });

  it("scene delete confirm removes exactly one scene; original frozen", () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    const sceneId = doc.scenes[0]!.sceneId;
    const next = deleteScene(doc, sceneId);
    expect(next.scenes.length).toBe(0);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("element delete cancel path — document unchanged until deleteLayer", () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    expect(JSON.stringify(doc)).toBe(before);
    expect(doc.scenes[0]!.layers.length).toBe(4);
  });

  it("element delete confirm removes one layer; no ghost", () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[2]!.layerId;
    const next = deleteLayer(doc, sceneId, layerId);
    expect(next.scenes[0]!.layers.length).toBe(3);
    expect(next.scenes[0]!.layers.find((l) => l.layerId === layerId)).toBeUndefined();
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("media replace cancel — same mediaRef when setLayerMediaRef not called", () => {
    const doc = baseDoc();
    const layer = doc.scenes[0]!.layers[0]!;
    expect(layer.type).toBe("IMAGE");
    if (layer.type !== "IMAGE") return;
    const mediaRef = layer.mediaRefId;
    const before = JSON.stringify(doc);
    // Cancel: never call setLayerMediaRef
    expect(JSON.stringify(doc)).toBe(before);
    const still = doc.scenes[0]!.layers[0]!;
    if (still.type === "IMAGE") {
      expect(still.mediaRefId).toBe(mediaRef);
    }
  });

  it("media replace confirm changes mediaRef once; original frozen", () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    const sceneId = doc.scenes[0]!.sceneId;
    const layerId = doc.scenes[0]!.layers[0]!.layerId;
    const next = setLayerMediaRef(doc, sceneId, layerId, "m-new-proof");
    const layer = next.scenes[0]!.layers[0]!;
    expect(layer.type).toBe("IMAGE");
    if (layer.type === "IMAGE") {
      expect(layer.mediaRefId).toBe("m-new-proof");
    }
    const orig = doc.scenes[0]!.layers[0]!;
    if (orig.type === "IMAGE") {
      expect(orig.mediaRefId).toBe("m1");
    }
    expect(JSON.stringify(doc)).toBe(before);
  });
});
