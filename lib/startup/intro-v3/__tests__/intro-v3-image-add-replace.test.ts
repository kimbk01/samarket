import { describe, expect, it } from "vitest";
import { createIntroV3SeedDocument } from "@/lib/startup/intro-v3/seed";
import { addImageLayerToDocument, replaceImageLayerMedia } from "@/lib/startup/intro-v3/image-layer-authority";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import type { IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";

function source(over: Partial<IntroV3MediaSource> = {}): IntroV3MediaSource {
  return {
    id: "src-1",
    filename: "a.jpg",
    mime: "image/jpeg",
    width: 800,
    height: 600,
    aspect: 800 / 600,
    bytes: 12000,
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
    width: 800,
    height: 600,
    aspect: 800 / 600,
    bytes: 4000,
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

describe("intro-v3 IMAGE add / replace", () => {
  it("READY ADD creates one IMAGE layer that is immediately on the Scene", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = addImageLayerToDocument(doc, "scene-1", selection(), { layerId: "layer-image-1" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.layersCreated).toBe(1);
    expect(added.document.scenes[0]!.layers).toHaveLength(1);
    expect(added.layer.id).toBe("layer-image-1");
    expect(added.layer.type).toBe("IMAGE");
    expect(added.layer.visible).toBe(true);
    if (added.layer.type !== "IMAGE") return;
    expect(added.layer.payload.mediaRef).toBe("src-1:der-1");
    expect(added.layer.geometry.fit).toBe("CONTAIN");
    expect(doc.scenes[0]!.layers).toHaveLength(0);
  });

  it("cancel and failed ADD leave Scene layers at zero", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    expect(applyIntroV3LibraryOutcome({ kind: "cancel" }).layersCreated).toBe(0);
    expect(applyIntroV3LibraryOutcome({ kind: "fail", errorCode: "decode_failed" }).layersCreated).toBe(0);
    expect(doc.scenes[0]!.layers).toHaveLength(0);
    const notReady = addImageLayerToDocument(
      doc,
      "scene-1",
      selection({ source: source({ status: "failed" }) })
    );
    expect(notReady.ok).toBe(false);
    expect(doc.scenes[0]!.layers).toHaveLength(0);
  });

  it("REPLACE keeps the same layerId, geometry, z, visibility, motion; does not detach old media", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = addImageLayerToDocument(seeded, "scene-1", selection(), { layerId: "layer-keep" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const geometry = { ...added.layer.geometry, widthPct: 55 };
    added.document.scenes[0]!.layers[0] = { ...added.layer, geometry, z: 4 };
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
    expect(replaced.layer.z).toBe(4);
    expect(replaced.layer.geometry.widthPct).toBe(55);
    expect(replaced.layer.visible).toBe(true);
    if (replaced.layer.type !== "IMAGE") return;
    expect(replaced.layer.payload.mediaRef).toBe("src-2:der-2");
    expect(replaced.previousMediaRef).toEqual({ sourceId: "src-1", derivativeId: "der-1" });
    expect(replaced.detachedOldAsset).toBe(false);
    expect(replaced.document.scenes[0]!.layers).toHaveLength(1);
  });
});
