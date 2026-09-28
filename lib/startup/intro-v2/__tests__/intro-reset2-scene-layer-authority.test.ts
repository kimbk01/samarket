/**
 * @vitest-environment node
 * RESET 2 — Scene / Layer domain authority. No 8MB / Preview PASS claims.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyIntroCmsSaveResult,
  cloneIntroAdminCampaign,
  discardIntroCmsEdits,
  introCmsDraftSavePayload,
  introCmsIsDirty,
  resolveIntroCmsUnsavedNavigation,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import {
  defaultNewCampaignDraft,
  defaultNewScene,
  type IntroAdminAsset,
  type IntroAdminCampaign,
} from "@/lib/startup/intro-v2/admin-editor-model";
import { resolveIntroUploadAttach } from "@/lib/startup/intro-v2/admin-operator-ux";
import { defaultImageLayer } from "@/lib/startup/intro-v2/composition";
import { adaptOperatorDraftToCanonical } from "@/lib/startup/intro-v2/legacy-operator-adapter";
import {
  INTRO_RESET2_ADVANCE_MODES,
  addLayerToSelectedScene,
  addSceneToCampaign,
  applyFailedOrCancelledImageSelection,
  campaignHasDeviceSpecificSceneCopies,
  classifyIntroLayer,
  createSemanticLayer,
  deleteLayerFromScene,
  deleteSceneFromCampaign,
  duplicateLayerInScene,
  duplicateSceneInCampaign,
  imageLayerCount,
  introLayerDisplayLabel,
  layersOwnedByScene,
  patchSceneCtaDestination,
  prepareIntroWorkingDraft,
  reorderLayersInScene,
  reorderScenesInCampaign,
  sceneAdvanceIsExplicit,
  sceneTransitionIsDistinctFromLayerAnimation,
  setLayerVisibleInScene,
  simulatePersistedReload,
} from "@/lib/startup/intro-v2/scene-layer-authority";
import type { IntroLayer } from "@/lib/startup/intro-v2/types";

function asset(id: string, fileName: string): IntroAdminAsset {
  return {
    id,
    kind: "image",
    storagePath: `intro/${fileName}`,
    publicUrl: `https://example.com/${fileName}`,
    mime: "image/jpeg",
    bytes: 12,
    sha256: null,
    width: 1080,
    height: 1350,
    durationMs: null,
    loop: false,
    decodeStatus: "ready",
  };
}

function campaign(partial?: Partial<IntroAdminCampaign>): IntroAdminCampaign {
  return {
    ...defaultNewCampaignDraft("RESET 2 QA"),
    id: "camp-reset2",
    updatedAt: "2026-09-28T00:00:00.000Z",
    updatedBy: "admin",
    scenes: [defaultNewScene("scene-1", 0, "Scene 1")],
    ...partial,
  };
}

describe("RESET 2 Scene/Layer domain", () => {
  it("1. Campaign has ordered Scenes", () => {
    const draft = campaign({
      scenes: [
        defaultNewScene("scene-1", 0, "Scene 1"),
        defaultNewScene("scene-2", 1, "Scene 2"),
      ],
    });
    expect(draft.scenes.map((scene) => scene.id)).toEqual(["scene-1", "scene-2"]);
    expect(draft.scenes.map((scene) => scene.sortOrder)).toEqual([0, 1]);
  });

  it("2. Add Scene", () => {
    const next = addSceneToCampaign(campaign(), "Scene 2");
    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[1]?.name).toBe("Scene 2");
    expect(next.scenes[1]?.id).not.toBe(next.scenes[0]?.id);
  });

  it("3. Select Scene switches Layer collection", () => {
    let draft = campaign();
    const text = addLayerToSelectedScene(draft, "scene-1", "TEXT", { text: "A only" });
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    draft = addSceneToCampaign(text.value, "Scene 2");
    const scene2 = draft.scenes[1]!;
    const cta = addLayerToSelectedScene(draft, scene2.id, "CTA");
    expect(cta.ok).toBe(true);
    if (!cta.ok) return;
    expect(layersOwnedByScene(cta.value, "scene-1").map((layer) => layer.type)).toEqual(["TEXT"]);
    expect(layersOwnedByScene(cta.value, scene2.id).map((layer) => layer.type)).toEqual(["CTA"]);
  });

  it("4. Duplicate Scene creates a new Scene ID", () => {
    const next = duplicateSceneInCampaign(campaign(), "scene-1");
    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[1]?.id).not.toBe("scene-1");
  });

  it("5. duplicated Scene Layers get new Layer IDs", () => {
    const withText = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "keep" });
    expect(withText.ok).toBe(true);
    if (!withText.ok) return;
    const originalLayerId = withText.value.scenes[0]!.layers[0]!.id;
    const next = duplicateSceneInCampaign(withText.value, "scene-1");
    const copied = next.scenes[1]!.layers[0]!;
    expect(copied.id).not.toBe(originalLayerId);
    expect(copied.text).toBe("keep");
    expect(next.scenes[0]!.layers[0]!.id).toBe(originalLayerId);
  });

  it("6. reorder Scenes persists", () => {
    const two = addSceneToCampaign(campaign(), "Scene 2");
    const reordered = reorderScenesInCampaign(two, 0, 1);
    const payload = introCmsDraftSavePayload(reordered);
    expect(payload.scenes.map((scene) => scene.name)).toEqual(["Scene 2", "Scene 1"]);
    expect(payload.scenes.map((scene) => scene.sortOrder)).toEqual([0, 1]);
  });

  it("7. delete Scene preserves valid campaign", () => {
    const two = addSceneToCampaign(campaign(), "Scene 2");
    const scene2Id = two.scenes[1]!.id;
    const next = deleteSceneFromCampaign(two, "scene-1");
    expect(next.scenes).toHaveLength(1);
    expect(next.scenes[0]?.id).toBe(scene2Id);
    expect(deleteSceneFromCampaign(campaign(), "scene-1").scenes).toHaveLength(1);
  });

  it("8. Scene A Layers never appear as Scene B ownership", () => {
    const withText = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "A" });
    expect(withText.ok).toBe(true);
    if (!withText.ok) return;
    const two = addSceneToCampaign(withText.value, "Scene 2");
    const aIds = layersOwnedByScene(two, "scene-1").map((layer) => layer.id);
    const bIds = layersOwnedByScene(two, two.scenes[1]!.id).map((layer) => layer.id);
    expect(aIds).toHaveLength(1);
    expect(bIds).toHaveLength(0);
    expect(aIds.some((id) => bIds.includes(id))).toBe(false);
  });

  it("9. add TEXT Layer", () => {
    const next = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "필리핀 생활을..." });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.scenes[0]?.layers[0]?.type).toBe("TEXT");
    expect(next.value.scenes[0]?.layers[0]?.text).toBe("필리핀 생활을...");
  });

  it("10. duplicate TEXT Layer gets a new ID", () => {
    const added = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "copy me" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const layerId = added.value.scenes[0]!.layers[0]!.id;
    const next = duplicateLayerInScene(added.value, "scene-1", layerId);
    expect(next.scenes[0]?.layers).toHaveLength(2);
    expect(next.scenes[0]?.layers[1]?.id).not.toBe(layerId);
    expect(next.scenes[0]?.layers[1]?.text).toBe("copy me");
  });

  it("11. reorder Layers persists", () => {
    const first = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "one" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addLayerToSelectedScene(first.value, "scene-1", "TEXT", { text: "two" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const reordered = reorderLayersInScene(second.value, "scene-1", 0, 1);
    const payload = introCmsDraftSavePayload(reordered);
    expect(payload.scenes[0]?.layers.map((layer) => layer.text)).toEqual(["two", "one"]);
  });

  it("12. hide/show persists", () => {
    const added = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "visible" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const layerId = added.value.scenes[0]!.layers[0]!.id;
    const hidden = setLayerVisibleInScene(added.value, "scene-1", layerId, false);
    expect(introCmsDraftSavePayload(hidden).scenes[0]?.layers[0]?.visible).toBe(false);
    const shown = setLayerVisibleInScene(hidden, "scene-1", layerId, true);
    expect(introCmsDraftSavePayload(shown).scenes[0]?.layers[0]?.visible).toBe(true);
  });

  it("13. delete Layer", () => {
    const added = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "gone" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const layerId = added.value.scenes[0]!.layers[0]!.id;
    const next = deleteLayerFromScene(added.value, "scene-1", layerId);
    expect(next.scenes[0]?.layers).toHaveLength(0);
  });

  it("14. CTA typed destination persists", () => {
    const added = addLayerToSelectedScene(campaign(), "scene-1", "CTA");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const patched = patchSceneCtaDestination(added.value, "scene-1", { type: "TRADE" });
    const payload = introCmsDraftSavePayload(patched);
    expect(payload.scenes[0]?.cta?.destination).toEqual({ type: "TRADE" });
    expect(payload.scenes[0]?.layers[0]?.type).toBe("CTA");
  });

  it("15. Decoration semantics persist", () => {
    const shape = addLayerToSelectedScene(campaign(), "scene-1", "DECORATION", {
      decorationKind: "shape",
    });
    expect(shape.ok).toBe(true);
    if (!shape.ok) return;
    expect(introCmsDraftSavePayload(shape.value).scenes[0]?.layers[0]?.decorationKind).toBe("shape");
    const sticker = addLayerToSelectedScene(campaign(), "scene-1", "DECORATION", {
      decorationKind: "sticker",
    });
    expect(sticker.ok).toBe(false);
  });

  it("16. Scene transition is distinct from Layer animation", () => {
    const added = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "motion" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const scene = {
      ...added.value.scenes[0]!,
      transition: "fade",
      transitionMs: 320,
      transitionEasing: "ease_in_out",
    };
    expect(sceneTransitionIsDistinctFromLayerAnimation(scene)).toBe(true);
    expect(scene.transition).toBe("fade");
    const animation = scene.layers[0]?.animation;
    expect(typeof animation === "object" && animation ? animation.enter?.type : null).toBe("none");
  });

  it("17. Scene advance is explicit", () => {
    expect(INTRO_RESET2_ADVANCE_MODES).toEqual(["timer", "media_end", "cta_only", "manual"]);
    expect(sceneAdvanceIsExplicit({ advanceMode: "timer", durationMs: 4000 })).toBe(true);
    expect(sceneAdvanceIsExplicit({ advanceMode: "timer", durationMs: 0 })).toBe(false);
    expect(sceneAdvanceIsExplicit({ advanceMode: "media_end", durationMs: null })).toBe(true);
    expect(sceneAdvanceIsExplicit({ advanceMode: "cta_only", durationMs: null })).toBe(true);
    expect(sceneAdvanceIsExplicit({ advanceMode: "manual", durationMs: null })).toBe(true);
  });

  it("18. no device-specific Scene copies", () => {
    const next = addSceneToCampaign(campaign(), "Scene 2");
    expect(campaignHasDeviceSpecificSceneCopies(next)).toBe(false);
    expect(next.scenes.some((scene) => /phone|tablet|android|ios/i.test(scene.name))).toBe(false);
  });

  it("19. IMAGE without asset cannot become a valid persisted Layer", () => {
    expect(createSemanticLayer("IMAGE", "tmp-l-1", 1).ok).toBe(false);
    expect(addLayerToSelectedScene(campaign(), "scene-1", "IMAGE").ok).toBe(false);
    const ghost: IntroLayer = { ...defaultImageLayer("tmp-l-ghost", 1) };
    const payload = introCmsDraftSavePayload(
      campaign({
        scenes: [{ ...defaultNewScene("scene-1", 0, "Scene 1"), layers: [ghost] }],
      })
    );
    expect(payload.scenes[0]?.layers).toHaveLength(0);
  });

  it("20. failed/cancelled image selection creates zero ghost Layers", () => {
    const before = campaign();
    const after = applyFailedOrCancelledImageSelection(before);
    expect(imageLayerCount(after.scenes[0]!)).toBe(0);
    expect(imageLayerCount(before.scenes[0]!)).toBe(0);
    expect(resolveIntroUploadAttach({
      layers: [],
      selectedLayerId: null,
      intendedLayerId: null,
      intent: "image",
    }).createType).toBeNull();
  });

  it("21. legacy campaign load does not duplicate IMAGE Layer", () => {
    const legacy = campaign({
      source: { sizePreset: "medium", displayDurationMs: 3500 },
      assets: [asset("asset-1", "hero.jpg")],
      scenes: [
        {
          ...defaultNewScene("scene-1", 0, "Scene 1"),
          backgroundColor: "#111111",
          backgroundAssetId: "asset-1",
          layers: [
            {
              ...defaultImageLayer("img-1", 1),
              assetId: "asset-1",
            },
          ],
        },
      ],
    });
    const first = prepareIntroWorkingDraft(legacy);
    const second = prepareIntroWorkingDraft(first);
    expect(first.scenes[0]?.layers.filter((layer) => layer.type === "IMAGE")).toHaveLength(1);
    expect(second.scenes[0]?.layers.filter((layer) => layer.type === "IMAGE")).toHaveLength(1);
    expect(adaptOperatorDraftToCanonical(legacy).scenes[0]?.layers).toHaveLength(1);
  });

  it("22. layer labels distinguish two different asset-backed Layers", () => {
    const assets = [asset("asset-a", "hero.jpg"), asset("asset-b", "dibay-logo.png")];
    const layers: IntroLayer[] = [
      { ...defaultImageLayer("img-a", 1), assetId: "asset-a" },
      { ...defaultImageLayer("img-b", 2), assetId: "asset-b" },
    ];
    const a = introLayerDisplayLabel({ layer: layers[0]!, assets, siblings: layers, lang: "ko" });
    const b = introLayerDisplayLabel({ layer: layers[1]!, assets, siblings: layers, lang: "ko" });
    expect(a).toContain("hero.jpg");
    expect(b).toContain("dibay-logo.png");
    expect(a).not.toBe(b);
    expect(a).not.toBe("이미지");
    expect(b).not.toBe("이미지");
  });

  it("23. save/reload preserves Scene/Layer identities", () => {
    const withText = addLayerToSelectedScene(campaign(), "scene-1", "TEXT", { text: "keep id" });
    expect(withText.ok).toBe(true);
    if (!withText.ok) return;
    const two = addSceneToCampaign(withText.value, "Scene 2");
    const scene1Id = two.scenes[0]!.id;
    const layerId = two.scenes[0]!.layers[0]!.id;
    const reloaded = simulatePersistedReload(two);
    expect(reloaded.scenes[0]?.id).toBe(scene1Id);
    expect(reloaded.scenes[0]?.layers[0]?.id).toBe(layerId);
    expect(reloaded.scenes.map((scene) => scene.sortOrder)).toEqual([0, 1]);
  });

  it("24. discard restores persisted document", () => {
    const saved = campaign();
    const current = addSceneToCampaign(cloneIntroAdminCampaign(saved), "Scene 2");
    expect(introCmsIsDirty(current, saved)).toBe(true);
    const restored = discardIntroCmsEdits(saved);
    expect(restored.scenes).toHaveLength(1);
    expect(restored.scenes[0]?.id).toBe("scene-1");
  });

  it("25. unsaved guard remains", () => {
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: null })).toBe("block");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: "stay" })).toBe("block");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: "discard_leave" })).toBe(
      "leave_without_save"
    );
    const failed = applyIntroCmsSaveResult({
      current: addSceneToCampaign(campaign(), "Scene 2"),
      ok: false,
      saved: null,
    });
    expect(failed.persisted).toBe(false);
    expect(failed.campaign.scenes).toHaveLength(2);
  });

  it("legacy IMAGE without geometry is LEGACY_COMPAT, ghost without asset is INVALID", () => {
    const assets = [asset("asset-1", "hero.jpg")];
    expect(
      classifyIntroLayer({ ...defaultImageLayer("img-1", 1), assetId: "asset-1" }, assets)
    ).toBe("VALID_ASSET_BOUND");
    expect(
      classifyIntroLayer(
        {
          id: "img-legacy",
          type: "IMAGE",
          zIndex: 1,
          anchor: "center",
          assetId: "asset-1",
        },
        assets
      )
    ).toBe("LEGACY_COMPAT");
    expect(classifyIntroLayer(defaultImageLayer("img-ghost", 1), assets)).toBe("INVALID_GHOST");
  });

  it("routed editor no longer creates IMAGE before a valid asset", () => {
    const editor = readFileSync("components/admin/intro/AdminIntroCmsEditorPage.tsx", "utf8");
    expect(editor).toContain("prepareIntroWorkingDraft");
    expect(editor).toContain("createSemanticLayer");
    expect(editor).toContain("introLayerDisplayLabel");
    expect(editor).not.toContain('addElement("IMAGE")');
    expect(editor).not.toContain('requestUpload("image")');
    expect(editor).not.toContain("defaultImageLayer");
    expect(editor).not.toContain("adaptOperatorDraftToCanonical(");
  });
});
