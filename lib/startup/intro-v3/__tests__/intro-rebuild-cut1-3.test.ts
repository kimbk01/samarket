/**
 * @vitest-environment node
 * CUT 1-3 Owner rebuild: route, seed, IMAGE add, cancel/fail zero layers.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { introV3CampaignSource } from "@/lib/startup/intro-v3/document";
import { extractIntroV3Document } from "@/lib/startup/intro-v3/document";
import { addImageLayerToDocument } from "@/lib/startup/intro-v3/image-layer-authority";
import { backgroundIsNotALayer } from "@/lib/startup/intro-v3/layer-model";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import type { IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";
import { createIntroV3SeedDocument } from "@/lib/startup/intro-v3/seed";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

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

describe("intro rebuild CUT 1-3 owner route", () => {
  it("Owner /admin/intro/[id] mounts NewIntroEditor and does not import rejected CMS", () => {
    const page = read("app/admin/intro/[campaignId]/page.tsx");
    const gate = read("components/admin/intro/AdminIntroCampaignRoute.tsx");
    const editor = read("components/admin/intro/NewIntroEditor.tsx");
    const canvas = read("components/admin/intro/IntroEditorCanvas.tsx");
    const legacy = read("components/admin/intro/AdminIntroLegacyReadOnly.tsx");
    const v3Page = read("app/admin/intro-v3/page.tsx");
    const v3Campaign = read("app/admin/intro-v3/[campaignId]/page.tsx");

    expect(page).toContain("AdminIntroCampaignRoute");
    expect(page).not.toContain("AdminIntroCmsEditorPage");
    expect(gate).toContain("NewIntroEditor");
    expect(gate).toContain("AdminIntroLegacyReadOnly");
    expect(gate).not.toContain("AdminIntroCmsEditorPage");
    expect(gate).not.toContain("AdminIntroCompositionCanvas");
    expect(gate).not.toContain("IntroV3OpenNotice");
    expect(editor).not.toContain("AdminIntroCmsEditorPage");
    expect(editor).not.toContain("AdminIntroCompositionCanvas");
    expect(editor).not.toContain("기존 파일로 추가");
    expect(editor).not.toContain("현재 Native에서는");
    expect(editor).toContain("IntroEditorCanvas");
    expect(editor).toContain("fitIntroEditorCanvas");
    expect(editor).toContain("data-intro-scene-properties");
    expect(editor).not.toContain("h-full max-h-full w-auto");
    expect(canvas).not.toContain("aspect-ratio");
    expect(canvas).toContain("data-intro-select-outline");
    expect(canvas).toContain("data-intro-resize-handle");
    expect(editor).toContain("IntroV3MediaLibrary");
    expect(editor).toContain('data-intro-editor="rebuild-v3"');
    expect(editor).toContain("data-intro-storyboard");
    expect(editor).toContain("data-intro-properties");
    expect(editor).toContain("data-intro-topbar");
    expect(editor).toContain("data-intro-add-image");
    expect(canvas).toContain('data-intro-canvas="1"');
    expect(canvas).toContain("SamarketThumbnail");
    expect(legacy).toContain("기존 인트로");
    expect(v3Page).toContain('redirect("/admin/intro")');
    expect(v3Campaign).toContain("redirect(`/admin/intro/${campaignId}`)");
    expect(existsSync(join(ROOT, "components/admin/intro/NewIntroEditor.tsx"))).toBe(true);
  });
});

describe("intro rebuild CUT 1-3 document + IMAGE", () => {
  it("new campaign seed is one Scene, green background, zero layers, background is not a Layer", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-qa" });
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0]!.background).toEqual({ type: "COLOR", color: "#0B5F3A" });
    expect(doc.scenes[0]!.layers).toHaveLength(0);
    expect(backgroundIsNotALayer(doc.scenes[0]!.layers)).toBe(true);
  });

  it("READY IMAGE add creates exactly one IMAGE with mediaRef; cancel/fail create zero", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-qa" });
    expect(applyIntroV3LibraryOutcome({ kind: "cancel" }).layersCreated).toBe(0);
    expect(applyIntroV3LibraryOutcome({ kind: "fail", errorCode: "decode_failed" }).layersCreated).toBe(0);
    expect(doc.scenes[0]!.layers).toHaveLength(0);

    const failed = addImageLayerToDocument(doc, "scene-qa", selection({ source: source({ status: "failed" }) }));
    expect(failed.ok).toBe(false);
    expect(doc.scenes[0]!.layers).toHaveLength(0);

    const added = addImageLayerToDocument(doc, "scene-qa", selection(), { layerId: "layer-image-1" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.layersCreated).toBe(1);
    expect(added.document.scenes[0]!.layers).toHaveLength(1);
    expect(added.layer.type).toBe("IMAGE");
    if (added.layer.type !== "IMAGE") return;
    expect(added.layer.payload.mediaRef).toBe("src-1:der-1");
    expect(doc.scenes[0]!.layers).toHaveLength(0);
  });

  it("Save round-trip preserves the semantic V3 document", () => {
    const seeded = createIntroV3SeedDocument({ sceneId: "scene-qa" });
    const added = addImageLayerToDocument(seeded, "scene-qa", selection(), { layerId: "layer-image-1" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const sourceBag = introV3CampaignSource(added.document);
    const extracted = extractIntroV3Document(sourceBag);
    expect(extracted).toEqual(added.document);
    expect(extracted?.scenes[0]?.layers).toHaveLength(1);
  });
});
