/**
 * @vitest-environment node
 * Phase 2 reopen — product semantics. Green geometry is not enough.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyIntroCmsSaveResult,
  discardIntroCmsEdits,
  introCmsDisplayFit,
  introCmsDraftSavePayload,
  introCmsIsDirty,
  introCmsPreviewFrame,
  introCmsPreviewInsets,
  resolveIntroCmsUnsavedNavigation,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import {
  defaultNewCampaignDraft,
  defaultNewScene,
  reorderScenes,
  type IntroAdminCampaign,
} from "@/lib/startup/intro-v2/admin-editor-model";
import {
  applyOperatorCtaDestination,
  canDestructivelyRemoveIntroAsset,
  inferOperatorAnimationPreset,
  introAspectRatioLabel,
  resolveIntroUploadAttach,
} from "@/lib/startup/intro-v2/admin-operator-ux";
import {
  INTRO_ADMIN_UPLOAD_MAX_SOURCE_BYTES,
  inspectIntroUploadFile,
  mapIntroUploadError,
} from "@/lib/startup/intro-v2/admin-upload";
import {
  INTRO_RICH_PUBLISH_MESSAGE_KO,
  introRichPublishBlockIssue,
} from "@/lib/startup/intro-v2/compat-publish";
import {
  campaignHasDeviceCreativeOverrides,
  defaultBackgroundLayer,
  defaultImageLayer,
  defaultLogoLayer,
  defaultTextLayer,
  introCompositionIdentities,
  introPreviewMutationCount,
} from "@/lib/startup/intro-v2/composition";
import {
  introBackgroundSurfaceRect,
  introLockedHeightPct,
  introMediaAspectRatio,
  introSceneSurfaceRect,
  transformLayerToRect,
} from "@/lib/startup/intro-v2/geometry";

const PHONE = { width: 360, height: 800 };
const TABLET = { width: 800, height: 1280 };
const INSETS = { top: 24, right: 0, bottom: 16, left: 0 };

function campaign(): IntroAdminCampaign {
  return {
    ...defaultNewCampaignDraft("Product QA"),
    id: "camp-sem",
    updatedAt: "2026-09-28T00:00:00.000Z",
    updatedBy: "admin",
    scenes: [
      { ...defaultNewScene("scene-1", 0, "Scene 1"), backgroundColor: "#013220" },
      { ...defaultNewScene("scene-2", 1, "Scene 2"), backgroundColor: "#111827" },
    ],
  };
}

describe("Intro Phase 2 product semantics", () => {
  it("Scene surface equals preview viewport — not an inner 234×520 poster", () => {
    expect(introSceneSurfaceRect(PHONE)).toEqual({ x: 0, y: 0, width: 360, height: 800 });
    expect(introCmsPreviewFrame("phone")).toMatchObject({ width: 360, height: 800 });
    const phoneFit = introCmsDisplayFit("phone");
    expect(phoneFit.logicalWidth).toBe(360);
    expect(phoneFit.logicalHeight).toBe(800);
    expect(phoneFit.displayWidth).toBe(360);
    expect(phoneFit.displayHeight).toBe(800);
    expect(phoneFit.displayWidth).not.toBe(234);
    expect(phoneFit.displayHeight).not.toBe(520);
  });

  it("Tablet/Wide display fit keeps Scene aspect — not 320×512 / 320×200", () => {
    const tablet = introCmsDisplayFit("tablet");
    const wide = introCmsDisplayFit("wide");
    expect(introCmsPreviewFrame("tablet")).toMatchObject({ width: 800, height: 1280 });
    expect(tablet.logicalWidth).toBe(800);
    expect(tablet.logicalHeight).toBe(1280);
    expect(tablet.displayWidth / tablet.displayHeight).toBeCloseTo(800 / 1280);
    expect(tablet.displayWidth).not.toBe(320);
    expect(tablet.displayHeight).not.toBe(512);
    expect(wide.logicalWidth).toBe(1280);
    expect(wide.logicalHeight).toBe(800);
    expect(wide.displayWidth / wide.displayHeight).toBeCloseTo(1280 / 800);
    expect(wide.displayWidth).not.toBe(320);
    expect(wide.displayHeight).not.toBe(200);
  });

  it("Background fills the complete Scene surface", () => {
    expect(introBackgroundSurfaceRect(PHONE)).toEqual({ x: 0, y: 0, width: 360, height: 800 });
    const bg = defaultBackgroundLayer("bg-1", 0);
    const rect = transformLayerToRect({
      layer: bg,
      viewport: PHONE,
      insets: INSETS,
    });
    expect(rect).toEqual({ x: 0, y: 0, width: 360, height: 800 });
  });

  it("Foreground may use safe-area; Background does not shrink into it", () => {
    const image = defaultImageLayer("img-1", 2);
    const imageRect = transformLayerToRect({
      layer: { ...image, xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, aspectPolicy: "none" },
      viewport: PHONE,
      insets: INSETS,
    });
    expect(imageRect.y).toBeGreaterThanOrEqual(INSETS.top);
    expect(imageRect.height).toBeLessThanOrEqual(PHONE.height - INSETS.top - INSETS.bottom);
    const bg = transformLayerToRect({
      layer: defaultBackgroundLayer("bg-1", 0),
      viewport: PHONE,
      insets: INSETS,
    });
    expect(bg.height).toBe(800);
  });

  it("Image intrinsic ratio is preserved under contain", () => {
    const layer = {
      ...defaultImageLayer("img-1", 1, "contain"),
      xPct: 50,
      yPct: 50,
      widthPct: 80,
      heightPct: 80,
    };
    const rect = transformLayerToRect({
      layer,
      viewport: PHONE,
      insets: INSETS,
      mediaWidth: 1200,
      mediaHeight: 800,
    });
    expect(rect.width / rect.height).toBeCloseTo(1200 / 800, 2);
    expect(introMediaAspectRatio(1200, 800)).toBeCloseTo(1.5);
    expect(introAspectRatioLabel(1200, 800)).toBe("3:2");
  });

  it("Cover fills the authored box without using image ratio as device ratio", () => {
    const layer = {
      ...defaultImageLayer("img-1", 1, "cover"),
      xPct: 50,
      yPct: 50,
      widthPct: 80,
      heightPct: 40,
    };
    const rect = transformLayerToRect({
      layer,
      viewport: PHONE,
      insets: INSETS,
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    expect(rect.width / PHONE.width).not.toBeCloseTo(1080 / 360);
    expect(rect.height).toBeGreaterThan(0);
    expect(PHONE.width).toBe(360);
    expect(PHONE.height).toBe(800);
  });

  it("Logo ratio lock derives height from width", () => {
    const logo = defaultLogoLayer("logo-1", 3);
    expect(logo.aspectPolicy).toBe("contain");
    const heightPct = introLockedHeightPct(40, 2, 360, 800);
    expect(heightPct).toBeCloseTo(9, 0);
  });

  it("Layer geometry transforms across Phone/Tablet with the same creative ids", () => {
    const layer = {
      ...defaultTextLayer("txt-1", 4),
      xPct: 50,
      yPct: 80,
      widthPct: 80,
      heightPct: 10,
    };
    const phone = transformLayerToRect({ layer, viewport: PHONE, insets: INSETS });
    const tablet = transformLayerToRect({
      layer,
      viewport: TABLET,
      insets: { top: 24, right: 16, bottom: 24, left: 16 },
    });
    expect(phone.y / PHONE.height).toBeGreaterThan(0.5);
    expect(tablet.y / TABLET.height).toBeGreaterThan(0.5);
    const draft = campaign();
    draft.scenes[0]!.layers = [layer];
    const ids = introCompositionIdentities({ campaignId: draft.id, scene: draft.scenes[0]! });
    expect(ids.layerIds).toEqual(["txt-1"]);
    expect(introPreviewMutationCount()).toBe(0);
    expect(campaignHasDeviceCreativeOverrides(draft)).toBe(false);
  });

  it("Scenes are sequential authorities — not overlapping Scene boxes", () => {
    const draft = campaign();
    expect(draft.scenes.map((scene) => scene.sortOrder)).toEqual([0, 1]);
    const reordered = {
      ...draft,
      scenes: reorderScenes(draft.scenes, 0, 1),
    };
    expect(reordered.scenes.map((scene) => scene.id)).toEqual(["scene-2", "scene-1"]);
    expect(reordered.scenes.map((scene) => scene.sortOrder)).toEqual([0, 1]);
  });

  it("CTA human destination maps to typed action", () => {
    const cta = applyOperatorCtaDestination(null, "TRADE");
    expect(cta.destination.type).toBe("TRADE");
    expect(applyOperatorCtaDestination(cta, "INTERNAL_PATH").destination.path).toBe("/philife");
  });

  it("Save / discard / unsaved guard remain Phase 1", () => {
    const saved = campaign();
    const dirty = { ...saved, name: "Edited" };
    expect(introCmsIsDirty(dirty, saved)).toBe(true);
    expect(discardIntroCmsEdits(saved).name).toBe("Product QA");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: null })).toBe("block");
    expect(
      applyIntroCmsSaveResult({ current: dirty, ok: true, saved: dirty }).persisted
    ).toBe(true);
    expect(introCmsDraftSavePayload(dirty).name).toBe("Edited");
  });

  it("Rich publish stays blocked until Native runtime supports it", () => {
    const draft = campaign();
    draft.scenes[0]!.layers = [defaultImageLayer("img-1", 1)];
    const issue = introRichPublishBlockIssue(draft);
    expect(issue?.code).toBe("rich_runtime_not_ready");
    expect(issue?.messageKo).toBe(INTRO_RICH_PUBLISH_MESSAGE_KO);
  });

  it("Published-history referenced assets cannot be destructively removed", () => {
    expect(
      canDestructivelyRemoveIntroAsset({
        assetId: "a1",
        published: { id: "pub-1" },
        referenced: true,
      })
    ).toBe(false);
    expect(
      canDestructivelyRemoveIntroAsset({
        assetId: "a1",
        published: null,
        referenced: true,
      })
    ).toBe(true);
  });

  it("Operator animation presets stay human-readable", () => {
    expect(inferOperatorAnimationPreset(undefined)).toBe("none");
  });

  it("Admin canvas dropped the 320×520 inner-composition letterbox", () => {
    const canvas = readFileSync("components/admin/intro/AdminIntroCompositionCanvas.tsx", "utf8");
    expect(canvas).toContain("introCmsDisplayFit");
    expect(canvas).toContain("transformLayerToRect");
    expect(canvas).toContain("introCmsPreviewFrame");
    expect(canvas).toContain('data-intro-inner-composition="none"');
    expect(canvas).not.toContain("computeContainedCreativeRect");
    expect(canvas).not.toContain("320 / frame.width");
    expect(canvas).not.toContain("520 / frame.height");
  });

  it("Late image upload attaches to the intended layer and does not steal a later TEXT selection", () => {
    const layers = [
      { id: "img-1", type: "IMAGE" },
      { id: "logo-1", type: "LOGO" },
      { id: "txt-1", type: "TEXT" },
    ];
    const lateLogo = resolveIntroUploadAttach({
      layers,
      selectedLayerId: "txt-1",
      intendedLayerId: "logo-1",
      intent: "logo",
    });
    expect(lateLogo).toEqual({
      targetLayerId: "logo-1",
      createType: null,
      selectAfter: false,
    });
    const freshImage = resolveIntroUploadAttach({
      layers: [{ id: "img-1", type: "IMAGE" }],
      selectedLayerId: "img-1",
      intendedLayerId: "img-1",
      intent: "image",
    });
    expect(freshImage.selectAfter).toBe(true);
    expect(freshImage.targetLayerId).toBe("img-1");
  });

  it("Editor presents sequential scenes, add-elements, and human CTA destinations", () => {
    const editor = readFileSync("components/admin/intro/AdminIntroCmsEditorPage.tsx", "utf8");
    expect(editor).toContain('data-intro-editor="cms-v1"');
    expect(editor).toContain("data-intro-storyboard");
    expect(editor).toContain("data-intro-add-elements");
    expect(editor).toContain("data-intro-layer-inventory");
    expect(editor).toContain("data-intro-unsaved-guard");
    expect(editor).toContain("INTRO_OPERATOR_CTA_DESTINATIONS");
    expect(editor).toContain("INTRO_OPERATOR_ANIMATION_PRESETS");
    expect(editor).toContain("requestUpload");
    expect(editor).toContain("onUpload");
    expect(editor).toContain("resolveIntroUploadAttach");
    expect(editor).toContain("data-intro-layer-text");
    expect(editor).toContain("/api/admin/intro-campaigns/upload-image");
    expect(editor).not.toContain("/api/admin/startup-config/upload-image");
    expect(editor).not.toContain("INTRO_LAYER_TYPES.map");
    expect(editor).not.toContain("이 기기군만 다름");
  });

  it("Intro CMS upload accepts 8MB images, sniffs empty mime, and does not use the 2MB Product Intro route", () => {
    expect(INTRO_ADMIN_UPLOAD_MAX_SOURCE_BYTES).toBe(8 * 1024 * 1024);
    expect(inspectIntroUploadFile({ name: "hero.jpg", type: "", size: 3 * 1024 * 1024 })).toEqual({
      ok: true,
      mime: "image/jpeg",
      needsCompress: false,
    });
    expect(inspectIntroUploadFile({ name: "hero.png", type: "image/png", size: 9 * 1024 * 1024 }).ok).toBe(
      false
    );
    expect(inspectIntroUploadFile({ name: "clip.heic", type: "", size: 400_000 }).ok).toBe(false);
    expect(mapIntroUploadError("file_too_large", "ko")).toContain("8MB");
    const route = readFileSync("app/api/admin/intro-campaigns/upload-image/route.ts", "utf8");
    expect(route).toContain("requireIntroAdminContext");
    expect(route).toContain("inspectIntroUploadFile");
    expect(route).toContain("registerIntroAdminAsset");
    expect(route).not.toContain("1080");
    expect(route).not.toContain("1350");
    expect(route).not.toContain("PRODUCT_INTRO_MAX_FILE_BYTES");
    expect(route).not.toContain("optimizeProductIntroCreativeBuffer");
  });
});
