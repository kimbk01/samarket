/**
 * @vitest-environment node
 * CUT 1 IMAGE AUTHORING — product contracts A–N.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createIntroV3SeedDocument } from "@/lib/startup/intro-v3/seed";
import {
  applyLocalImageGeometry,
  commitIntroV3ImageLibraryOutcome,
  createIdlePointerWriteProbe,
  deleteImageLayerFromDocument,
  hydrateIntroV3SavedDocument,
  introV3IsDirty,
  introV3WorkingFingerprint,
  serializeIntroV3WorkingDraft,
  setImageLayerFit,
} from "@/lib/startup/intro-v3/image-layer-authority";
import {
  introV3GeometryHasCssPixels,
  normalizeIntroV3Geometry,
  resizeIntroV3GeometryPreserveAspect,
  translateIntroV3Geometry,
} from "@/lib/startup/intro-v3/geometry";
import type { IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";
import { INTRO_V3_SOURCE_MAX_BYTES } from "@/lib/startup/intro-v3/media-policy";

const ROOT = process.cwd();
const LIVE_CAMPAIGN = "924cee3f-12ec-4336-b0db-82eca2f8b425";
const LIVE_PUBLICATION = "2cff7d7b-7f34-4730-aaf6-ec86b40a052a";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function source(over: Partial<IntroV3MediaSource> = {}): IntroV3MediaSource {
  return {
    id: "src-1",
    filename: "hero.jpg",
    mime: "image/jpeg",
    width: 1600,
    height: 900,
    aspect: 1600 / 900,
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
    width: 1600,
    height: 900,
    aspect: 1600 / 900,
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

function imageCount(document: ReturnType<typeof createIntroV3SeedDocument>): number {
  return document.scenes[0]!.layers.filter((layer) => layer.type === "IMAGE").length;
}

describe("CUT 1 IMAGE authoring A–N", () => {
  it("A. upload cancel → layer 0 mutation", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const next = commitIntroV3ImageLibraryOutcome({
      document: doc,
      sceneId: "scene-1",
      outcome: { kind: "cancel" },
    });
    expect(next.layersCreated).toBe(0);
    expect(next.sceneMutated).toBe(false);
    expect(imageCount(next.document)).toBe(0);
    expect(imageCount(doc)).toBe(0);
  });

  it("B. upload failure → layer 0 mutation", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const next = commitIntroV3ImageLibraryOutcome({
      document: doc,
      sceneId: "scene-1",
      outcome: { kind: "fail", errorCode: "network_upload_failed" },
    });
    expect(next.layersCreated).toBe(0);
    expect(imageCount(next.document)).toBe(0);
  });

  it("C. processing failure → layer 0 mutation", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const failed = commitIntroV3ImageLibraryOutcome({
      document: doc,
      sceneId: "scene-1",
      outcome: { kind: "fail", errorCode: "processing_failed" },
    });
    expect(failed.layersCreated).toBe(0);
    const notReady = commitIntroV3ImageLibraryOutcome({
      document: doc,
      sceneId: "scene-1",
      outcome: {
        kind: "select",
        selection: selection({ source: source({ status: "failed" }), derivative: derivative({ status: "failed" }) }),
      },
    });
    expect(notReady.layersCreated).toBe(0);
    expect(imageCount(notReady.document)).toBe(0);
  });

  it("D. READY → exactly one IMAGE layer", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const next = commitIntroV3ImageLibraryOutcome({
      document: doc,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    expect(next.layersCreated).toBe(1);
    expect(imageCount(next.document)).toBe(1);
    expect(next.document.scenes[0]!.layers[0]!.type).toBe("IMAGE");
    expect(next.selectedLayerId).toBe(next.document.scenes[0]!.layers[0]!.id);
    expect(imageCount(doc)).toBe(0);
  });

  it("E. Replace cancel → original mediaRef", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const layerId = added.selectedLayerId!;
    const original =
      added.document.scenes[0]!.layers[0]!.type === "IMAGE"
        ? added.document.scenes[0]!.layers[0]!.payload.mediaRef
        : "";
    const cancelled = commitIntroV3ImageLibraryOutcome({
      document: added.document,
      sceneId: "scene-1",
      outcome: { kind: "cancel" },
      replaceLayerId: layerId,
    });
    expect(cancelled.layersCreated).toBe(0);
    expect(cancelled.document.scenes[0]!.layers).toHaveLength(1);
    expect(cancelled.document.scenes[0]!.layers[0]!.id).toBe(layerId);
    if (cancelled.document.scenes[0]!.layers[0]!.type === "IMAGE") {
      expect(cancelled.document.scenes[0]!.layers[0]!.payload.mediaRef).toBe(original);
    }
  });

  it("F. Replace fail → original mediaRef", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const layerId = added.selectedLayerId!;
    const failed = commitIntroV3ImageLibraryOutcome({
      document: added.document,
      sceneId: "scene-1",
      outcome: { kind: "fail", errorCode: "processing_failed" },
      replaceLayerId: layerId,
    });
    expect(failed.document.scenes[0]!.layers[0]!.id).toBe(layerId);
    if (failed.document.scenes[0]!.layers[0]!.type === "IMAGE") {
      expect(failed.document.scenes[0]!.layers[0]!.payload.mediaRef).toBe("src-1:der-1");
    }
  });

  it("G. Replace success → same layerId / new mediaRef", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const layerId = added.selectedLayerId!;
    const geometry = { ...added.document.scenes[0]!.layers[0]!.geometry, widthPct: 48, xPct: 40 };
    added.document.scenes[0]!.layers[0] = {
      ...added.document.scenes[0]!.layers[0]!,
      geometry,
      z: 3,
    };
    const replaced = commitIntroV3ImageLibraryOutcome({
      document: added.document,
      sceneId: "scene-1",
      outcome: {
        kind: "select",
        selection: selection({
          intent: "REPLACE_MEDIA",
          mediaRef: { sourceId: "src-2", derivativeId: "der-2" },
          source: source({ id: "src-2" }),
          derivative: derivative({ id: "der-2", sourceId: "src-2" }),
        }),
      },
      replaceLayerId: layerId,
    });
    expect(replaced.layersCreated).toBe(0);
    expect(replaced.selectedLayerId).toBe(layerId);
    expect(replaced.document.scenes[0]!.layers).toHaveLength(1);
    const layer = replaced.document.scenes[0]!.layers[0]!;
    expect(layer.id).toBe(layerId);
    expect(layer.z).toBe(3);
    expect(layer.geometry.widthPct).toBe(48);
    expect(layer.geometry.xPct).toBe(40);
    if (layer.type === "IMAGE") expect(layer.payload.mediaRef).toBe("src-2:der-2");
    expect(replaced.detachedOldAsset).toBe(false);
  });

  it("H. geometry normalization rejects CSS px and keeps SCENE_NORMALIZED_PCT", () => {
    const geo = normalizeIntroV3Geometry({
      xPct: 12,
      yPct: 20,
      widthPct: 40,
      heightPct: 22.5,
      anchor: "middle-center",
      fit: "CONTAIN",
    });
    expect(geo?.xPct).toBe(12);
    expect(introV3GeometryHasCssPixels({ xPx: 8 })).toBe(true);
    expect(normalizeIntroV3Geometry({ ...geo, xPx: 320 })).toBeNull();
  });

  it("I. aspect-preserving resize keeps media ratio", () => {
    const start = normalizeIntroV3Geometry({
      xPct: 50,
      yPct: 50,
      widthPct: 40,
      heightPct: 12.5,
      anchor: "middle-center",
      fit: "CONTAIN",
    })!;
    const next = resizeIntroV3GeometryPreserveAspect({
      geometry: start,
      handle: "se",
      dxPct: 10,
      dyPct: 80,
      mediaAspect: 16 / 9,
      surfaceWidth: 360,
      surfaceHeight: 640,
    });
    const nextAspect = (next.widthPct / 100) * 360 / ((next.heightPct / 100) * 640);
    expect(nextAspect).toBeCloseTo(16 / 9, 2);
    expect(next.fit).toBe("CONTAIN");
  });

  it("J. drag during persistence write 0", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const layerId = added.selectedLayerId!;
    const probe = createIdlePointerWriteProbe();
    const moved = applyLocalImageGeometry(
      added.document,
      layerId,
      translateIntroV3Geometry(added.document.scenes[0]!.layers[0]!.geometry, { dxPct: 8, dyPct: -4 }),
      probe
    );
    expect(moved.ok).toBe(true);
    expect(probe).toEqual({ dbWrite: 0, apiWrite: 0, upload: 0, process: 0 });
    const workspace = read("components/admin/intro/IntroEditor/SceneWorkspace.tsx");
    expect(workspace).toContain("onPointerMove");
    expect(workspace).not.toContain("fetch(");
    expect(workspace).not.toContain("method: \"PATCH\"");
  });

  it("K. Save serialization keeps Scene / IMAGE / mediaRef / geometry / fit / visibility / z", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const fit = setImageLayerFit(added.document, added.selectedLayerId!, "COVER");
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    const serialized = serializeIntroV3WorkingDraft(fit.document);
    const layer = serialized.scenes[0]!.layers[0]!;
    expect(serialized.scenes[0]!.background.type).toBe("COLOR");
    expect(layer.type).toBe("IMAGE");
    expect(layer.visible).toBe(true);
    expect(layer.geometry.fit).toBe("COVER");
    if (layer.type === "IMAGE") expect(layer.payload.mediaRef).toBe("src-1:der-1");
  });

  it("L. hydrate round-trip restores the same composition", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const hydrated = hydrateIntroV3SavedDocument(serializeIntroV3WorkingDraft(added.document));
    expect(hydrated).not.toBeNull();
    const original = added.document.scenes[0]!.layers[0]!;
    const layer = hydrated!.scenes[0]!.layers[0]!;
    expect(layer.id).toBe(added.selectedLayerId);
    expect(layer.geometry).toEqual(original.geometry);
    expect(layer.visible).toBe(original.visible);
    expect(layer.z).toBe(original.z);
    if (layer.type === "IMAGE" && original.type === "IMAGE") {
      expect(layer.payload.mediaRef).toBe(original.payload.mediaRef);
    }
    const again = hydrateIntroV3SavedDocument(serializeIntroV3WorkingDraft(hydrated!));
    expect(again).not.toBeNull();
    expect(
      introV3IsDirty(
        introV3WorkingFingerprint({ name: "Cut 1", document: hydrated! }),
        introV3WorkingFingerprint({ name: "Cut 1", document: again! })
      )
    ).toBe(false);
  });

  it("M. Delete removes the IMAGE layer only", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-1" });
    const added = commitIntroV3ImageLibraryOutcome({
      document: seeded,
      sceneId: "scene-1",
      outcome: { kind: "select", selection: selection() },
    });
    const deleted = deleteImageLayerFromDocument(added.document, added.selectedLayerId!);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.detachedAsset).toBe(false);
    expect(imageCount(deleted.document)).toBe(0);
    expect(imageCount(added.document)).toBe(1);
    const editor = read("components/admin/intro/IntroEditor/IntroEditor.tsx");
    expect(editor).toContain("deleteImageLayerFromDocument");
    expect(editor).not.toContain("storage.from(");
    expect(editor).not.toContain("remove(");
  });

  it("N. existing legacy publication writer is untouched", () => {
    const writer = read("lib/startup/intro-v3/admin-service.ts");
    const editor = read("components/admin/intro/IntroEditor/IntroEditor.tsx");
    const gate = read("components/admin/intro/AdminIntroCampaignRoute.tsx");
    expect(writer).toContain('.from("intro_campaigns")');
    expect(writer).not.toContain("intro_publications");
    expect(editor).not.toContain(LIVE_CAMPAIGN);
    expect(editor).not.toContain(LIVE_PUBLICATION);
    expect(gate).toContain("AdminIntroLegacyReadOnly");
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroLegacyReadOnly.tsx"))).toBe(true);
  });

  it("CUT 1 editor is product authority and does not restore 8MB as product policy", () => {
    const editor = read("components/admin/intro/IntroEditor/IntroEditor.tsx");
    const upload = read("lib/startup/intro-v3/media-upload-client.ts");
    expect(editor).toContain('data-intro-editor="cut-1-image"');
    expect(editor).not.toContain("foundation-b");
    expect(editor).toContain("IntroMediaLibrary");
    expect(editor).toContain("commitIntroV3ImageLibraryOutcome");
    expect(upload).toContain("/api/admin/intro-v3/media/sign");
    expect(upload).toContain("/api/admin/intro-v3/media/process");
    expect(upload).not.toContain("8 * 1024 * 1024");
    expect(upload).not.toContain("3.2");
    expect(INTRO_V3_SOURCE_MAX_BYTES).toBe(32 * 1024 * 1024);
    expect(existsSync(join(ROOT, "app/api/admin/intro-campaigns/upload-image/route.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/startup/intro-v2/admin-upload-client.ts"))).toBe(false);
  });
});
