/**
 * @vitest-environment node
 * Phase 2 canonical composition — Scene / Layer / geometry / publish gate.
 */
import { describe, expect, it } from "vitest";
import {
  applyIntroCmsSaveResult,
  cloneIntroAdminCampaign,
  discardIntroCmsEdits,
  introCmsCanDeleteScene,
  introCmsDraftSavePayload,
  introCmsIsDirty,
  introCmsPreviewFrame,
  introCmsPreviewInsets,
  resolveIntroCmsUnsavedNavigation,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import {
  defaultNewCampaignDraft,
  defaultNewScene,
  duplicateScene,
  nextSceneSortOrder,
  reorderScenes,
  type IntroAdminCampaign,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import { validateIntroCampaignDraft } from "@/lib/startup/intro-v2/admin-validate";
import {
  INTRO_RICH_PUBLISH_MESSAGE_KO,
  introRichPublishBlockIssue,
  isV1CompatibleIntroComposition,
} from "@/lib/startup/intro-v2/compat-publish";
import {
  campaignHasDeviceCreativeOverrides,
  createLayerOfType,
  defaultCtaLayer,
  defaultDecorationLayer,
  defaultImageLayer,
  defaultTextLayer,
  emptyAnimationMeta,
  introCompositionIdentities,
  introPreviewMutationCount,
} from "@/lib/startup/intro-v2/composition";
import { transformLayerToRect } from "@/lib/startup/intro-v2/geometry";
import {
  INTRO_SIZE_PRESET_FINAL_AUTHORITY,
  adaptOperatorDraftToCanonical,
} from "@/lib/startup/intro-v2/legacy-operator-adapter";
import type { IntroLayer } from "@/lib/startup/intro-v2/types";

function campaign(partial?: Partial<IntroAdminCampaign>): IntroAdminCampaign {
  return {
    ...defaultNewCampaignDraft("Phase 2 QA"),
    id: "camp-p2",
    updatedAt: "2026-09-28T00:00:00.000Z",
    updatedBy: "admin",
    scenes: [defaultNewScene("scene-1", 0, "Scene 1")],
    ...partial,
  };
}

function imageLayer(id = "img-1"): IntroLayer {
  return {
    ...defaultImageLayer(id, 1, "contain"),
    assetId: "asset-1",
  };
}

function operatorLikeScene(): IntroAdminScene {
  return {
    ...defaultNewScene("scene-1", 0, "Scene 1"),
    advanceMode: "timer",
    durationMs: 4000,
    maxHoldMs: 8000,
    layers: [imageLayer()],
    cta: {
      enabled: true,
      destination: { type: "COMMUNITY" },
      label: "시작하기",
    },
  };
}

describe("Phase 2 Scene 1..N", () => {
  it("1. one Campaign supports multiple Scenes", () => {
    const next = campaign({
      scenes: [
        defaultNewScene("scene-1", 0, "A"),
        defaultNewScene("scene-2", 1, "B"),
      ],
    });
    expect(next.scenes).toHaveLength(2);
    expect(new Set(next.scenes.map((scene) => scene.id)).size).toBe(2);
  });

  it("2. Scene add keeps a valid campaign", () => {
    const current = campaign();
    const added = defaultNewScene(
      "scene-2",
      nextSceneSortOrder(current.scenes),
      "Scene 2"
    );
    const scenes = [...current.scenes, added];
    expect(scenes).toHaveLength(2);
    expect(introCmsCanDeleteScene(scenes.length)).toBe(true);
    expect(validateIntroCampaignDraft({ ...current, scenes }).ok).toBe(true);
  });

  it("3. Scene duplicate creates new scene and layer IDs", () => {
    const scene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [defaultTextLayer("text-1", 1, "안녕")],
    };
    const copy = duplicateScene(scene, "scene-2", 1);
    expect(copy.id).toBe("scene-2");
    expect(copy.id).not.toBe(scene.id);
    expect(copy.layers[0]?.id).not.toBe("text-1");
    expect(copy.layers[0]?.text).toBe("안녕");
  });

  it("4. Scene reorder persists stable order", () => {
    const scenes = [
      defaultNewScene("a", 0, "A"),
      defaultNewScene("b", 1, "B"),
      defaultNewScene("c", 2, "C"),
    ];
    const reordered = reorderScenes(scenes, 0, 2);
    expect(reordered.map((scene) => scene.id)).toEqual(["b", "c", "a"]);
    expect(reordered.map((scene) => scene.sortOrder)).toEqual([0, 1, 2]);
    const payload = introCmsDraftSavePayload(campaign({ scenes: reordered }));
    expect(payload.scenes.map((scene) => scene.id)).toEqual(["b", "c", "a"]);
  });

  it("5. Scene delete cannot remove the final Scene", () => {
    expect(introCmsCanDeleteScene(1)).toBe(false);
    expect(introCmsCanDeleteScene(2)).toBe(true);
  });
});

describe("Phase 2 Layers", () => {
  it("6. multiple Layers per Scene persist", () => {
    const scene: IntroAdminScene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [
        imageLayer("img-1"),
        defaultTextLayer("text-1", 2, "Hello"),
        defaultDecorationLayer("dec-1", 3, "shape"),
      ],
    };
    const payload = introCmsDraftSavePayload(campaign({ scenes: [scene] }));
    expect(payload.scenes[0]?.layers).toHaveLength(3);
    expect(payload.scenes[0]?.layers.map((layer) => layer.type)).toEqual([
      "IMAGE",
      "TEXT",
      "DECORATION",
    ]);
  });

  it("7. layer z-order is deterministic", () => {
    const layers = [
      { ...defaultTextLayer("t", 2, "A") },
      { ...imageLayer("i"), zIndex: 1 },
    ];
    const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    expect(ordered.map((layer) => layer.id)).toEqual(["i", "t"]);
  });

  it("8. TEXT persists", () => {
    const scene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [defaultTextLayer("text-1", 1, "저장되는 문장")],
    };
    const payload = introCmsDraftSavePayload(campaign({ scenes: [scene] }));
    expect(payload.scenes[0]?.layers[0]?.text).toBe("저장되는 문장");
  });

  it("9. CTA persists typed action", () => {
    const scene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [defaultCtaLayer("cta-1", 1)],
      cta: {
        enabled: true,
        destination: { type: "TRADE" as const },
        label: "거래로",
      },
    };
    const payload = introCmsDraftSavePayload(campaign({ scenes: [scene] }));
    expect(payload.scenes[0]?.cta?.destination.type).toBe("TRADE");
    expect(payload.scenes[0]?.layers[0]?.type).toBe("CTA");
  });

  it("10. Decoration persists", () => {
    const scene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [defaultDecorationLayer("dec-1", 1, "divider")],
    };
    const payload = introCmsDraftSavePayload(campaign({ scenes: [scene] }));
    expect(payload.scenes[0]?.layers[0]?.decorationKind).toBe("divider");
  });

  it("11. animation metadata persists", () => {
    const animation = {
      ...emptyAnimationMeta(),
      enter: { type: "fade" as const, durationMs: 240, delayMs: 0, easing: "ease_out" as const, repeat: "none" as const },
    };
    const layer = { ...defaultTextLayer("text-1", 1, "Hi"), animation };
    const payload = introCmsDraftSavePayload(
      campaign({ scenes: [{ ...defaultNewScene("scene-1", 0, "A"), layers: [layer] }] })
    );
    const saved = payload.scenes[0]?.layers[0]?.animation;
    expect(typeof saved).toBe("object");
    expect(saved && typeof saved === "object" ? saved.enter?.type : null).toBe("fade");
  });
});

describe("Phase 2 responsive preview", () => {
  it("12. Phone/Tablet/Wide use identical creative IDs", () => {
    const scene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [imageLayer(), defaultTextLayer("text-1", 2, "동일")],
      cta: { enabled: true, destination: { type: "COMMUNITY" as const }, label: "시작" },
    };
    const identities = introCompositionIdentities({ campaignId: "camp-p2", scene });
    expect(identities.campaignId).toBe("camp-p2");
    expect(identities.sceneId).toBe("scene-1");
    expect(identities.layerIds).toEqual(["img-1", "text-1"]);
    expect(identities.texts).toEqual(["동일"]);
    expect(identities.ctaTarget).toBe("COMMUNITY");
    for (const viewport of ["phone", "tablet", "wide"] as const) {
      const frame = introCmsPreviewFrame(viewport);
      expect(frame.writesCreative).toBe(false);
      expect(introCompositionIdentities({ campaignId: "camp-p2", scene })).toEqual(identities);
    }
  });

  it("13. preview viewport switch performs no mutation", () => {
    expect(introPreviewMutationCount()).toBe(0);
    expect(introCmsPreviewFrame("phone").writesCreative).toBe(false);
    expect(introCmsPreviewFrame("tablet").writesCreative).toBe(false);
    expect(introCmsPreviewFrame("wide").writesCreative).toBe(false);
  });

  it("14. no device creative override is created by save payload", () => {
    const payload = introCmsDraftSavePayload(campaign());
    expect("deviceOverrides" in payload).toBe(false);
    expect(campaignHasDeviceCreativeOverrides(campaign({ deviceOverrides: [] }))).toBe(false);
  });

  it("15. responsive transform is deterministic", () => {
    const layer = imageLayer();
    const phone = introCmsPreviewFrame("phone");
    const tablet = introCmsPreviewFrame("tablet");
    const a = transformLayerToRect({
      layer,
      viewport: phone,
      insets: introCmsPreviewInsets("phone"),
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    const b = transformLayerToRect({
      layer,
      viewport: phone,
      insets: introCmsPreviewInsets("phone"),
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    const c = transformLayerToRect({
      layer,
      viewport: tablet,
      insets: introCmsPreviewInsets("tablet"),
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    expect(a).toEqual(b);
    expect(c.width).not.toBe(a.width);
  });

  it("16. safe-area rule is deterministic", () => {
    const layer = { ...imageLayer(), safeArea: true };
    const phone = transformLayerToRect({
      layer,
      viewport: introCmsPreviewFrame("phone"),
      insets: introCmsPreviewInsets("phone"),
    });
    const full = transformLayerToRect({
      layer: { ...layer, safeArea: false },
      viewport: introCmsPreviewFrame("phone"),
      insets: introCmsPreviewInsets("phone"),
    });
    expect(phone).toEqual(
      transformLayerToRect({
        layer,
        viewport: introCmsPreviewFrame("phone"),
        insets: introCmsPreviewInsets("phone"),
      })
    );
    expect(full.y).toBeLessThan(phone.y);
  });

  it("17. IMAGE CONTAIN fits inside the authored box", () => {
    const rect = transformLayerToRect({
      layer: { ...imageLayer(), aspectPolicy: "contain", widthPct: 80, heightPct: 60 },
      viewport: { width: 360, height: 800 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    expect(rect.width).toBeLessThanOrEqual(288.01);
    expect(rect.height).toBeLessThanOrEqual(480.01);
  });

  it("18. IMAGE COVER fills the authored box", () => {
    const contain = transformLayerToRect({
      layer: { ...imageLayer(), aspectPolicy: "contain", widthPct: 80, heightPct: 60 },
      viewport: { width: 360, height: 800 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    const cover = transformLayerToRect({
      layer: { ...imageLayer(), aspectPolicy: "cover", widthPct: 80, heightPct: 60 },
      viewport: { width: 360, height: 800 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      mediaWidth: 1080,
      mediaHeight: 1350,
    });
    expect(cover.width * cover.height).toBeGreaterThan(contain.width * contain.height);
  });
});

describe("Phase 2 migration / Phase 1 / publish / validation", () => {
  it("19. Operator legacy campaign migrates into canonical Scene/Layer draft", () => {
    const legacy = campaign({
      source: { sizePreset: "medium", displayDurationMs: 3500 },
      scenes: [
        {
          ...operatorLikeScene(),
          layers: [
            {
              id: "img-1",
              type: "IMAGE",
              zIndex: 1,
              anchor: "center",
              assetId: "asset-1",
              aspectPolicy: "contain",
            },
          ],
        },
      ],
    });
    const adapted = adaptOperatorDraftToCanonical(legacy);
    expect(INTRO_SIZE_PRESET_FINAL_AUTHORITY).toBe(false);
    expect(adapted.source.sizePresetFinalAuthority).toBe(false);
    expect(adapted.scenes[0]?.layers[0]?.xPct).toBe(50);
    expect(adapted.scenes[0]?.layers[0]?.widthPct).toBe(72);
    expect(adapted.source.sizePreset).toBe("medium");
  });

  it("20. Phase 1 dirty/save/discard/guard still passes", () => {
    const saved = campaign();
    const current = cloneIntroAdminCampaign(saved);
    expect(introCmsIsDirty(current, saved)).toBe(false);
    const edited = { ...current, name: "Changed" };
    expect(introCmsIsDirty(edited, saved)).toBe(true);
    const failed = applyIntroCmsSaveResult({ current: edited, ok: false, saved: null });
    expect(failed.persisted).toBe(false);
    expect(failed.campaign.name).toBe("Changed");
    const discarded = discardIntroCmsEdits(saved);
    expect(discarded.name).toBe("Phase 2 QA");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: "stay" })).toBe("block");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: "discard_leave" })).toBe(
      "leave_without_save"
    );
  });

  it("21. rich draft cannot be published through incompatible V1 runtime", () => {
    const rich = campaign({
      scenes: [
        {
          ...defaultNewScene("scene-1", 0, "A"),
          layers: [imageLayer(), defaultTextLayer("text-1", 2, "리치")],
        },
        defaultNewScene("scene-2", 1, "B"),
      ],
    });
    const blocked = introRichPublishBlockIssue(rich);
    expect(isV1CompatibleIntroComposition(rich)).toBe(false);
    expect(blocked?.code).toBe("rich_runtime_not_ready");
    expect(blocked?.messageKo).toBe(INTRO_RICH_PUBLISH_MESSAGE_KO);
  });

  it("22. existing compatible legacy publish path does not regress", () => {
    const legacy = campaign({
      scenes: [operatorLikeScene()],
      assets: [
        {
          id: "asset-1",
          kind: "image",
          storagePath: "intro/a.webp",
          publicUrl: "https://example.com/a.webp",
          mime: "image/webp",
          bytes: 1,
          sha256: null,
          width: 1080,
          height: 1350,
          durationMs: null,
          loop: false,
          decodeStatus: "ready",
        },
      ],
    });
    expect(isV1CompatibleIntroComposition(legacy)).toBe(true);
    expect(introRichPublishBlockIssue(legacy)).toBeNull();
  });

  it("23. validation rejects malformed Scene/Layer data", () => {
    const missingText = campaign({
      scenes: [
        {
          ...defaultNewScene("scene-1", 0, "A"),
          layers: [{ ...defaultTextLayer("text-1", 1, ""), text: "" }],
        },
      ],
    });
    const missingImage = campaign({
      scenes: [
        {
          ...defaultNewScene("scene-1", 0, "A"),
          layers: [createLayerOfType("IMAGE", "img-empty", 1)],
        },
      ],
    });
    const mediaEnd = campaign({
      scenes: [{ ...defaultNewScene("scene-1", 0, "A"), advanceMode: "media_end", layers: [imageLayer()] }],
    });
    expect(validateIntroCampaignDraft(missingText).issues.some((issue) => issue.code === "layer_text_required")).toBe(
      true
    );
    expect(validateIntroCampaignDraft(missingImage).issues.some((issue) => issue.code === "layer_asset_required")).toBe(
      true
    );
    expect(
      validateIntroCampaignDraft(mediaEnd).issues.some((issue) => issue.code === "media_end_requires_ending_media")
    ).toBe(true);
  });

  it("24. Unicode Text is preserved", () => {
    const text = "안녕 👋 디바이";
    const scene = {
      ...defaultNewScene("scene-1", 0, "A"),
      layers: [defaultTextLayer("text-1", 1, text)],
    };
    const payload = introCmsDraftSavePayload(campaign({ scenes: [scene] }));
    expect(payload.scenes[0]?.layers[0]?.text).toBe(text);
    expect(introCompositionIdentities({ campaignId: "camp-p2", scene }).texts).toEqual([text]);
  });
});
