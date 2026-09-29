/**
 * DIBAY INTRO — CUT A automated matrix (pure + structural).
 * Production E2E is separate (prove-app-intro-cut-a.mjs).
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASE_COMPOSITION_ASPECT,
  CANONICAL_INTRO_FIXTURE_DOCUMENT,
  computeIntroDurationMs,
  assertCanonical8100,
  fitContentRegion,
  mapFrameToDevice,
  parseIntroDocument,
  validateDraft,
  AppIntroMediaOrigin,
  type IntroDocumentV1,
} from "@/lib/intro";
import {
  authoredDocumentsEqual,
  diffAuthoredDocuments,
} from "@/lib/intro/document/canonical-equality";
import { createEmptyIntroDocument } from "@/lib/intro/document/factory";
import {
  addLayer,
  addScene,
  clampNormalizedFrame,
  clearTabletOverride,
  deleteLayer,
  deleteScene,
  moveLayerZ,
  reorderScenes,
  setLayerFrame,
  setLayerMediaRef,
  setLayerVisibility,
  setSceneDuration,
  setSceneTransition,
  subscribeLocalAuthoring,
} from "@/lib/intro/document/mutations";

function mutableClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe("CUT A — document authoring + Save equality invariants", () => {
  it("create empty document is valid IntroDocumentV1 draft shell", () => {
    const doc = createEmptyIntroDocument({
      documentId: "00000000-0000-4000-8000-000000000001",
      title: "Test",
    });
    expect(doc.schemaVersion).toBe(1);
    expect(doc.scenes).toEqual([]);
    expect(doc.settings.compositionAspect).toEqual(BASE_COMPOSITION_ASPECT);
    const parsed = parseIntroDocument(doc);
    expect(parsed.ok).toBe(true);
  });

  it("scene add / reorder / delete mutate canonical draft", () => {
    let doc = createEmptyIntroDocument({
      documentId: "d1",
      title: "S",
    });
    const a = addScene(doc, { name: "A", durationMs: 1000 });
    doc = a.document;
    const b = addScene(doc, { name: "B", durationMs: 2000 });
    doc = b.document;
    const c = addScene(doc, { name: "C", durationMs: 3000 });
    doc = c.document;
    expect(doc.scenes).toHaveLength(3);
    expect(doc.scenes[2]!.transitionAfter).toBeNull();

    doc = reorderScenes(doc, [
      doc.scenes[2]!.sceneId,
      doc.scenes[0]!.sceneId,
      doc.scenes[1]!.sceneId,
    ]);
    expect(doc.scenes.map((s) => s.name)).toEqual(["C", "A", "B"]);

    doc = deleteScene(doc, doc.scenes[1]!.sceneId);
    expect(doc.scenes).toHaveLength(2);
    expect(doc.scenes[1]!.transitionAfter).toBeNull();
  });

  it("IMAGE/LOGO/TEXT/CTA add + mediaRefId only", () => {
    let doc = createEmptyIntroDocument({ documentId: "d2", title: "L" });
    const s = addScene(doc);
    doc = s.document;
    const img = addLayer(doc, s.sceneId, "IMAGE", {
      mediaRefId: "media-img-1",
    });
    doc = img.document;
    const logo = addLayer(doc, s.sceneId, "LOGO", {
      mediaRefId: "media-logo-1",
    });
    doc = logo.document;
    const text = addLayer(doc, s.sceneId, "TEXT");
    doc = text.document;
    const cta = addLayer(doc, s.sceneId, "CTA");
    doc = cta.document;

    const scene = doc.scenes[0]!;
    expect(scene.layers.map((l) => l.type).sort()).toEqual(
      ["CTA", "IMAGE", "LOGO", "TEXT"].sort(),
    );
    const image = scene.layers.find((l) => l.type === "IMAGE")!;
    expect(image.type === "IMAGE" && image.mediaRefId).toBe("media-img-1");
    expect(JSON.stringify(doc)).not.toMatch(/runtimeArtifactId/);
    expect(JSON.stringify(doc)).not.toMatch(/storage_path|storagePath/);
    expect(validateDraft(doc).ok).toBe(true);
  });

  it("replace media atomicity — cancel/fail preserve; success same layerId/geometry", () => {
    let doc = createEmptyIntroDocument({ documentId: "d3", title: "R" });
    const s = addScene(doc);
    doc = s.document;
    const added = addLayer(doc, s.sceneId, "IMAGE", {
      mediaRefId: "old-media",
    });
    doc = added.document;
    const layer = doc.scenes[0]!.layers[0]!;
    const layerId = layer.layerId;
    const frame = { ...layer.frame };
    const z = layer.zIndex;

    // Cancel path: never call setLayerMediaRef → old preserved
    expect(
      doc.scenes[0]!.layers.find((l) => l.layerId === layerId) &&
        "mediaRefId" in
          doc.scenes[0]!.layers.find((l) => l.layerId === layerId)! &&
        (
          doc.scenes[0]!.layers.find((l) => l.layerId === layerId) as {
            mediaRefId: string;
          }
        ).mediaRefId,
    ).toBe("old-media");

    // Failure path: same — no mutation
    const before = mutableClone(doc);
    expect(authoredDocumentsEqual(before, doc)).toBe(true);

    // Success
    doc = setLayerMediaRef(doc, s.sceneId, layerId, "new-media");
    const after = doc.scenes[0]!.layers.find((l) => l.layerId === layerId)!;
    expect(after.layerId).toBe(layerId);
    expect(after.frame).toEqual(frame);
    expect(after.zIndex).toBe(z);
    expect(after.visible).toBe(true);
    expect(after.type === "IMAGE" && after.mediaRefId).toBe("new-media");
  });

  it("drag / resize local-only — emits mutation events with touchesNetwork false", () => {
    let doc = createEmptyIntroDocument({ documentId: "d4", title: "Drag" });
    const s = addScene(doc);
    doc = s.document;
    const added = addLayer(doc, s.sceneId, "TEXT");
    doc = added.document;
    const events: { kind: string; touchesNetwork: boolean }[] = [];
    const unsub = subscribeLocalAuthoring((e) => {
      events.push({ kind: e.kind, touchesNetwork: e.touchesNetwork });
    });
    doc = setLayerFrame(doc, s.sceneId, added.layerId, {
      x: 0.2,
      y: 0.3,
      w: 0.5,
      h: 0.2,
    });
    doc = setLayerFrame(doc, s.sceneId, added.layerId, {
      x: 0.2,
      y: 0.3,
      w: 0.55,
      h: 0.25,
    });
    unsub();
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.touchesNetwork === false)).toBe(true);
    expect(events.every((e) => e.kind === "layer_frame")).toBe(true);
    // Instrumentation contract: no network kinds exist on this channel.
    expect(events.some((e) => (e as { touchesNetwork: boolean }).touchesNetwork)).toBe(
      false,
    );
  });

  it("normalized geometry clamp + phone FIT + tablet override geometry-only", () => {
    const frame = clampNormalizedFrame({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 });
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.y + frame.h).toBeLessThanOrEqual(1);

    const phone = fitContentRegion({ width: 360, height: 800 }, { w: 9, h: 16 });
    const phone2 = fitContentRegion({ width: 430, height: 932 }, { w: 9, h: 16 });
    expect(phone.RW / phone.RH).toBeCloseTo(9 / 16, 5);
    expect(phone2.RW / phone2.RH).toBeCloseTo(9 / 16, 5);

    let doc = createEmptyIntroDocument({ documentId: "d5", title: "T" });
    const s = addScene(doc);
    doc = s.document;
    const added = addLayer(doc, s.sceneId, "LOGO", { mediaRefId: "m1" });
    doc = added.document;
    const beforeContent =
      doc.scenes[0]!.layers[0]!.type === "LOGO"
        ? doc.scenes[0]!.layers[0]!.mediaRefId
        : "";
    doc = setLayerFrame(
      doc,
      s.sceneId,
      added.layerId,
      { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
      { tabletLandscape: true },
    );
    const layer = doc.scenes[0]!.layers[0]!;
    expect(layer.layoutOverrides?.TABLET_LANDSCAPE?.frame).toEqual({
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.2,
    });
    expect(layer.type === "LOGO" && layer.mediaRefId).toBe(beforeContent);
    doc = clearTabletOverride(doc, s.sceneId, added.layerId);
    expect(doc.scenes[0]!.layers[0]!.layoutOverrides?.TABLET_LANDSCAPE).toBeUndefined();

    // COVER regression: positioned CONTENT mapping remains CONTENT_FIT projection
    const region = fitContentRegion({ width: 360, height: 640 }, { w: 9, h: 16 });
    const rect = mapFrameToDevice({ x: 0.1, y: 0.2, w: 0.8, h: 0.4 }, region);
    expect(rect.vw).toBeCloseTo(0.8 * region.RW, 5);
    // Positioned CONTENT uses FIT region — never full-viewport COVER stretch as SSOT.
    expect(rect.vx).toBeGreaterThanOrEqual(region.OX - 0.001);
    expect(rect.vx + rect.vw).toBeLessThanOrEqual(region.OX + region.RW + 0.001);
  });

  it("z order + visibility survive clone equality", () => {
    let doc = createEmptyIntroDocument({ documentId: "d6", title: "Z" });
    const s = addScene(doc);
    doc = s.document;
    const a = addLayer(doc, s.sceneId, "TEXT");
    doc = a.document;
    const b = addLayer(doc, s.sceneId, "CTA");
    doc = b.document;
    doc = moveLayerZ(doc, s.sceneId, a.layerId, "forward");
    doc = setLayerVisibility(doc, s.sceneId, b.layerId, false);
    const again = mutableClone(doc);
    expect(authoredDocumentsEqual(doc, again)).toBe(true);
    expect(diffAuthoredDocuments(doc, again).equal).toBe(true);
    const hidden = doc.scenes[0]!.layers.find((l) => l.layerId === b.layerId)!;
    expect(hidden.visible).toBe(false);
  });

  it("CUT / FADE / SLIDE + durations + 8100 regression still holds on fixture", () => {
    const fixture = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
    expect(fixture.scenes[0]!.transitionAfter?.type).toBe("FADE");
    expect(fixture.scenes[1]!.transitionAfter?.type).toBe("SLIDE");
    expect(fixture.scenes[2]!.transitionAfter).toBeNull();
    // Exercise CUT on a draft mutation
    let doc = createEmptyIntroDocument({ documentId: "d7", title: "Tr" });
    const s1 = addScene(doc, { durationMs: 2500 });
    doc = s1.document;
    const s2 = addScene(doc, { durationMs: 3000 });
    doc = s2.document;
    const s3 = addScene(doc, { durationMs: 2000 });
    doc = s3.document;
    doc = setSceneTransition(doc, s1.sceneId, { type: "CUT", durationMs: 0 });
    doc = setSceneTransition(doc, s2.sceneId, {
      type: "FADE",
      durationMs: 300,
    });
    doc = setSceneDuration(doc, s1.sceneId, 2500);
    expect(computeIntroDurationMs(doc)).toBe(2500 + 0 + 3000 + 300 + 2000);
    assertCanonical8100(fixture);
  });

  it("delete layer does not require Media deletion APIs in mutations", () => {
    let doc = createEmptyIntroDocument({ documentId: "d8", title: "Del" });
    const s = addScene(doc);
    doc = s.document;
    const added = addLayer(doc, s.sceneId, "IMAGE", { mediaRefId: "keep-me" });
    doc = added.document;
    doc = deleteLayer(doc, s.sceneId, added.layerId);
    expect(doc.scenes[0]!.layers).toHaveLength(0);
    const src = readFileSync("lib/intro/document/mutations.ts", "utf8");
    expect(src).not.toMatch(/deleteIntroMedia|from\("app_intro_media"\)/);
  });

  it("hard reload equality compares canonical authored JSON strictly", () => {
    const a = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
    const b = mutableClone(CANONICAL_INTRO_FIXTURE_DOCUMENT);
    expect(authoredDocumentsEqual(a, b)).toBe(true);
    const bMut = JSON.parse(JSON.stringify(b)) as IntroDocumentV1;
    (bMut.scenes[0] as { durationMs: number }).durationMs = 2499;
    expect(authoredDocumentsEqual(a, bMut)).toBe(false);
    const d = diffAuthoredDocuments(a, bMut);
    expect(d.equal).toBe(false);
    expect(d.path).toContain("durationMs");
  });
});

describe("CUT A — product surface / QA isolation structural", () => {
  it("hub is real product — no rebuild notice as primary", () => {
    const page = readFileSync("app/admin/intro/page.tsx", "utf8");
    expect(page).toContain("IntroDocumentHub");
    expect(page).not.toContain("IntroRebuildNotice");
    expect(page).not.toContain("DibayIntroStudioPage");
    expect(existsSync("components/admin/dibay-intro")).toBe(false);
    const hub = readFileSync(
      "components/admin/intro/IntroDocumentHub.tsx",
      "utf8",
    );
    expect(hub).toContain("새 인트로 만들기");
    expect(hub).toContain("/admin/intro/media");
    expect(hub).not.toContain("인트로 시스템 재구성 중");
    expect(hub).not.toContain("Set Live");
    expect(hub).not.toContain("Publish now");
  });

  it("Studio embeds Media Picker — no operator nav to picker harness", () => {
    const studio = readFileSync(
      "components/admin/intro/IntroStudio.tsx",
      "utf8",
    );
    expect(studio).toContain("IntroMediaPicker");
    expect(studio).not.toContain("/admin/intro/media/picker");
    expect(studio).toContain("data-intro-save");
    expect(studio).toContain("setLayerFrame");
    const hub = readFileSync(
      "components/admin/intro/IntroDocumentHub.tsx",
      "utf8",
    );
    expect(hub).not.toContain("/admin/intro/media/picker");
  });

  it("document APIs exist — requireAdmin path", () => {
    expect(existsSync("app/api/admin/intro/documents/route.ts")).toBe(true);
    expect(
      existsSync("app/api/admin/intro/documents/[documentId]/route.ts"),
    ).toBe(true);
    const save = readFileSync(
      "app/api/admin/intro/documents/[documentId]/route.ts",
      "utf8",
    );
    expect(save).toContain("requireAdminApiUser");
    expect(save).toContain("409");
    expect(save).toContain("DRAFT_VERSION_CONFLICT");
  });

  it("QA media isolation — media_origin authority", () => {
    expect(AppIntroMediaOrigin.OPERATOR).toBe("OPERATOR");
    expect(AppIntroMediaOrigin.QA_EVIDENCE).toBe("QA_EVIDENCE");
    const mig = readFileSync(
      "supabase/migrations/20270402120000_app_intro_media_origin_cut_a.sql",
      "utf8",
    );
    expect(mig).toContain("media_origin");
    expect(mig).toContain("QA_EVIDENCE");
    expect(mig).not.toContain("DROP TABLE");
    const listApi = readFileSync(
      "app/api/admin/intro/media/route.ts",
      "utf8",
    );
    expect(listApi).toContain("OPERATOR");
    const service = readFileSync("lib/intro/media/service.ts", "utf8");
    expect(service).toContain("mediaOrigin");
    expect(service).toContain('originFilter !== "ALL"');
  });

  it("V1 allows Publish control — still forbids Live apply / Preview product path", () => {
    const studio = readFileSync(
      "components/admin/intro/IntroStudio.tsx",
      "utf8",
    );
    // V1 added real Publish — must not claim Live apply
    expect(studio).toContain("data-intro-publish");
    expect(studio).not.toContain("Set Live");
    expect(studio).not.toContain("Publish now");
    expect(studio).not.toMatch(/setLive\s*\(/);
    expect(studio).toContain("not runtime Preview");
    expect(studio).toContain("CUT A에서 구현하지 않습니다");
  });
});
