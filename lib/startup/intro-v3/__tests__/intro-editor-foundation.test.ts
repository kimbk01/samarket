import { describe, expect, it } from "vitest";
import { introV3CampaignSource, extractIntroV3Document } from "@/lib/startup/intro-v3/document";
import { INTRO_EDITOR_CANVAS_FIT_OCCUPANCY, fitIntroEditorCanvas } from "@/lib/startup/intro-v3/editor-canvas-fit";
import {
  deleteIntroV3Layer,
  patchIntroV3LayerFit,
  patchIntroV3LayerGeometry,
  patchIntroV3Scene,
} from "@/lib/startup/intro-v3/editor-document";
import {
  dragIntroV3Geometry,
  pointerDeltaToNormalizedPct,
  resizeIntroV3Geometry,
} from "@/lib/startup/intro-v3/editor-pointer-geometry";
import {
  INTRO_V3_INITIAL_IMAGE_OCCUPANCY_PCT,
  initialIntroV3ImageGeometry,
} from "@/lib/startup/intro-v3/geometry";
import { addImageLayerToDocument, replaceImageLayerMedia } from "@/lib/startup/intro-v3/image-layer-authority";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import type { IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";
import { createIntroV3SeedDocument } from "@/lib/startup/intro-v3/seed";

function source(over: Partial<IntroV3MediaSource> = {}): IntroV3MediaSource {
  return {
    id: "src-1",
    filename: "photo.jpg",
    mime: "image/jpeg",
    width: 1600,
    height: 1200,
    aspect: 1600 / 1200,
    bytes: 48_000,
    orientationDeg: 0,
    storagePath: "_admin/intro-v3/sources/u/src-1.jpg",
    publicUrl:
      "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/intro-v3/sources/u/src-1.jpg",
    status: "ready",
    errorCode: null,
    createdAt: "2026-09-28T00:00:00.000Z",
    ...over,
  };
}

function derivative(over: Partial<IntroV3MediaDerivative> = {}): IntroV3MediaDerivative {
  return {
    id: "der-1",
    sourceId: "src-1",
    kind: "STILL_RUNTIME",
    format: "webp",
    width: 1600,
    height: 1200,
    aspect: 1600 / 1200,
    bytes: 12_000,
    storagePath: "_admin/intro-v3/derivatives/src-1/der-1.webp",
    publicUrl:
      "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/intro-v3/derivatives/src-1/der-1.webp",
    status: "ready",
    revision: 1,
    ...over,
  };
}

function selection(over: Partial<IntroV3LibrarySelection> = {}): IntroV3LibrarySelection {
  const src = source();
  const der = derivative();
  return {
    intent: "ADD_IMAGE",
    mediaRef: { sourceId: src.id, derivativeId: der.id },
    source: src,
    derivative: der,
    ...over,
  };
}

describe("intro editor canvas fit", () => {
  it("is bounded by available width and height and keeps 9:16", () => {
    const wide = fitIntroEditorCanvas({ availableW: 656, availableH: 679 });
    expect(wide.renderedW).toBeLessThanOrEqual(656 * INTRO_EDITOR_CANVAS_FIT_OCCUPANCY + 0.11);
    expect(wide.renderedH).toBeLessThanOrEqual(679 * INTRO_EDITOR_CANVAS_FIT_OCCUPANCY + 0.11);
    expect(wide.renderedW / wide.renderedH).toBeCloseTo(9 / 16, 8);
    expect(wide.overflow).toBe(false);

    const tall = fitIntroEditorCanvas({ availableW: 200, availableH: 2000 });
    expect(tall.renderedW).toBeLessThanOrEqual(200);
    expect(tall.renderedH).toBeLessThan(2000 * 0.5);
    expect(tall.renderedW / tall.renderedH).toBeCloseTo(9 / 16, 8);

    const short = fitIntroEditorCanvas({ availableW: 2000, availableH: 400 });
    expect(short.renderedH).toBeLessThanOrEqual(400);
    expect(short.renderedW).toBeLessThan(2000 * 0.5);
    expect(short.renderedW / short.renderedH).toBeCloseTo(9 / 16, 8);
  });

  it("does not derive size from height alone when width is the tighter bound", () => {
    const fit = fitIntroEditorCanvas({ availableW: 180, availableH: 900 });
    const heightOnlyW = 900 * INTRO_EDITOR_CANVAS_FIT_OCCUPANCY * (9 / 16);
    expect(fit.renderedW).toBeLessThan(heightOnlyW - 10);
    expect(fit.renderedW).toBeLessThanOrEqual(180 * INTRO_EDITOR_CANVAS_FIT_OCCUPANCY + 0.11);
  });
});

describe("intro editor image insertion", () => {
  it("preserves source aspect and is immediately on the Scene", () => {
    const geo = initialIntroV3ImageGeometry({ mediaWidth: 1600, mediaHeight: 1200 });
    expect(geo.fit).toBe("CONTAIN");
    expect(geo.anchor).toBe("middle-center");
    expect(geo.xPct).toBe(50);
    expect(geo.yPct).toBe(50);
    const sceneAspect = 9 / 16;
    const mediaAspect = 1600 / 1200;
    expect(geo.widthPct / geo.heightPct).toBeCloseTo(mediaAspect / sceneAspect, 1);
    expect(Math.max(geo.widthPct, geo.heightPct)).toBeLessThanOrEqual(INTRO_V3_INITIAL_IMAGE_OCCUPANCY_PCT);

    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = addImageLayerToDocument(doc, "scene-1", selection(), { layerId: "layer-image-1" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.layer.id).toBe("layer-image-1");
    expect(added.layer.geometry.widthPct / added.layer.geometry.heightPct).toBeCloseTo(mediaAspect / sceneAspect, 1);
  });
});

describe("intro editor drag / resize", () => {
  it("converts pointer delta into normalized geometry and clamps", () => {
    const delta = pointerDeltaToNormalizedPct({
      pointerDeltaX: 38.2,
      pointerDeltaY: 0,
      renderedCanvasWidth: 382,
      renderedCanvasHeight: 679,
    });
    expect(delta.deltaXPct).toBeCloseTo(10, 5);

    const start = initialIntroV3ImageGeometry({ mediaWidth: 1600, mediaHeight: 1200 });
    const moved = dragIntroV3Geometry({ start, deltaXPct: 10, deltaYPct: -5 });
    expect(moved.xPct).not.toBe(start.xPct);
    expect(moved.widthPct).toBe(start.widthPct);
    expect(moved.heightPct).toBe(start.heightPct);

    const escaped = dragIntroV3Geometry({ start, deltaXPct: 400, deltaYPct: 400 });
    expect(escaped.xPct + escaped.widthPct / 2).toBeLessThanOrEqual(100.05);
    expect(escaped.yPct + escaped.heightPct / 2).toBeLessThanOrEqual(100.05);
  });

  it("resizes with aspect lock and rejects invalid geometry", () => {
    const start = initialIntroV3ImageGeometry({ mediaWidth: 1600, mediaHeight: 1200 });
    const ratio = start.widthPct / start.heightPct;
    const resized = resizeIntroV3Geometry({
      start,
      handle: "e",
      pointerXPct: start.xPct + 20,
      pointerYPct: start.yPct,
      aspectLocked: true,
      mediaAspect: 1600 / 1200,
    });
    expect(resized.widthPct).toBeGreaterThan(0);
    expect(resized.heightPct).toBeGreaterThan(0);
    expect(resized.widthPct / resized.heightPct).toBeCloseTo(ratio, 1);

    const collapsed = resizeIntroV3Geometry({
      start,
      handle: "e",
      pointerXPct: start.xPct - start.widthPct / 2,
      pointerYPct: start.yPct,
      aspectLocked: false,
      mediaAspect: 1600 / 1200,
    });
    expect(collapsed.widthPct).toBeGreaterThanOrEqual(4);
    expect(collapsed.heightPct).toBeGreaterThanOrEqual(4);
  });
});

describe("intro editor save / replace / cancel", () => {
  it("save round-trip keeps ids, mediaRef, and normalized geometry", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = addImageLayerToDocument(seeded, "scene-1", selection(), { layerId: "layer-keep" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const moved = patchIntroV3LayerGeometry(
      added.document,
      "layer-keep",
      dragIntroV3Geometry({ start: added.layer.geometry, deltaXPct: 6, deltaYPct: -3 })
    );
    expect(moved).not.toBeNull();
    if (!moved) return;
    const extracted = extractIntroV3Document(introV3CampaignSource(moved));
    expect(extracted?.scenes[0]?.id).toBe("scene-1");
    expect(extracted?.scenes[0]?.layers[0]?.id).toBe("layer-keep");
    if (extracted?.scenes[0]?.layers[0]?.type !== "IMAGE") return;
    expect(extracted.scenes[0].layers[0].payload.mediaRef).toBe("src-1:der-1");
    expect(extracted.scenes[0].layers[0].geometry).toEqual(moved.scenes[0]!.layers[0]!.geometry);
  });

  it("replace failure keeps the old mediaRef; cancel does not mutate", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = addImageLayerToDocument(seeded, "scene-1", selection(), { layerId: "layer-keep" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(applyIntroV3LibraryOutcome({ kind: "cancel" }).layersCreated).toBe(0);
    expect(added.document.scenes[0]!.layers).toHaveLength(1);

    const failed = replaceImageLayerMedia(
      added.document,
      "layer-keep",
      selection({ source: source({ status: "failed" }), derivative: derivative({ status: "failed" }) })
    );
    expect(failed.ok).toBe(false);
    if (added.document.scenes[0]!.layers[0]!.type !== "IMAGE") return;
    expect(added.document.scenes[0]!.layers[0]!.payload.mediaRef).toBe("src-1:der-1");

    const replaced = replaceImageLayerMedia(
      added.document,
      "layer-keep",
      selection({
        intent: "REPLACE_MEDIA",
        mediaRef: { sourceId: "src-2", derivativeId: "der-2" },
        source: source({ id: "src-2" }),
        derivative: derivative({ id: "der-2", sourceId: "src-2" }),
      })
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.layer.id).toBe("layer-keep");
    if (replaced.layer.type !== "IMAGE") return;
    expect(replaced.layer.payload.mediaRef).toBe("src-2:der-2");
  });

  it("scene properties fallback and IMAGE fit patch do not change layer identity", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = addImageLayerToDocument(seeded, "scene-1", selection(), { layerId: "layer-keep" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const scenePatched = patchIntroV3Scene(added.document, "scene-1", { holdMs: 4100, advance: "MANUAL" });
    expect(scenePatched?.scenes[0]?.holdMs).toBe(4100);
    expect(scenePatched?.scenes[0]?.layers[0]?.id).toBe("layer-keep");
    const fitted = patchIntroV3LayerFit(scenePatched!, "layer-keep", "COVER");
    expect(fitted?.scenes[0]?.layers[0]?.geometry.fit).toBe("COVER");
    const removed = deleteIntroV3Layer(fitted!, "layer-keep");
    expect(removed?.scenes[0]?.layers).toHaveLength(0);
  });
});
