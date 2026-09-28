/**
 * RESET 2 — one Scene/Layer working-draft authority.
 * Media picker / byte policy / geometry / preview / Native are out of scope.
 */

import {
  defaultNewScene,
  duplicateScene,
  nextSceneSortOrder,
  reorderLayers,
  reorderScenes,
  type IntroAdminAsset,
  type IntroAdminCampaign,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import {
  introDecorationKindLabel,
  introLayerTypeLabel,
  introTextStyleLabel,
  type IntroLang,
} from "@/lib/startup/intro-v2/admin-labels";
import { introAssetFileName } from "@/lib/startup/intro-v2/admin-operator-ux";
import {
  createLayerOfType,
  defaultCtaLayer,
  defaultDecorationLayer,
  defaultImageLayer,
  defaultLogoLayer,
  defaultTextLayer,
  nextLayerId,
} from "@/lib/startup/intro-v2/composition";
import { adaptOperatorDraftToCanonical } from "@/lib/startup/intro-v2/legacy-operator-adapter";
import type {
  ContractResult,
  IntroAdvanceMode,
  IntroCtaDestination,
  IntroDecorationKind,
  IntroLayer,
  IntroLayerType,
} from "@/lib/startup/intro-v2/types";

export const INTRO_SCENE_MEANING = "sequential_screen" as const;
export const INTRO_LAYER_OVERLAP_SCOPE = "selected_scene" as const;

export const INTRO_RESET2_ADVANCE_MODES = ["timer", "media_end", "cta_only", "manual"] as const;
export type IntroReset2AdvanceMode = (typeof INTRO_RESET2_ADVANCE_MODES)[number];

export type IntroLayerAssetClass = "VALID_ASSET_BOUND" | "LEGACY_COMPAT" | "INVALID_GHOST";

export function nextSceneId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isAssetBackedLayer(layer: Pick<IntroLayer, "type" | "decorationKind">): boolean {
  return layer.type === "IMAGE" || layer.type === "LOGO" || layer.decorationKind === "sticker";
}

export function layerHasValidAssetRef(
  layer: Pick<IntroLayer, "assetId">,
  assets: readonly Pick<IntroAdminAsset, "id">[]
): boolean {
  const id = layer.assetId?.trim();
  if (!id) return false;
  return assets.some((asset) => asset.id === id);
}

export function classifyIntroLayer(
  layer: IntroLayer,
  assets: readonly Pick<IntroAdminAsset, "id">[]
): IntroLayerAssetClass {
  if (!isAssetBackedLayer(layer)) return "VALID_ASSET_BOUND";
  if (!layerHasValidAssetRef(layer, assets)) return "INVALID_GHOST";
  const missingBox =
    layer.xPct == null || layer.yPct == null || layer.widthPct == null || layer.heightPct == null;
  return missingBox ? "LEGACY_COMPAT" : "VALID_ASSET_BOUND";
}

export function isSessionGhostLayer(layer: IntroLayer): boolean {
  return isAssetBackedLayer(layer) && !layer.assetId?.trim() && layer.id.startsWith("tmp-");
}

export function imageLayerCount(scene: Pick<IntroAdminScene, "layers">): number {
  return scene.layers.filter((layer) => layer.type === "IMAGE").length;
}

export function createSemanticLayer(
  type: IntroLayerType,
  id: string,
  zIndex: number,
  opts?: { assetId?: string; decorationKind?: IntroDecorationKind; text?: string; ctaLabel?: string }
): ContractResult<IntroLayer> {
  if (type === "BACKGROUND") {
    return { ok: false, error: "background_is_scene_authority" };
  }
  if (type === "IMAGE" || type === "LOGO") {
    const assetId = opts?.assetId?.trim();
    if (!assetId) return { ok: false, error: "layer_asset_required" };
    const base = type === "LOGO" ? defaultLogoLayer(id, zIndex) : defaultImageLayer(id, zIndex);
    return { ok: true, value: { ...base, assetId } };
  }
  if (type === "TEXT") {
    return { ok: true, value: defaultTextLayer(id, zIndex, opts?.text ?? "텍스트") };
  }
  if (type === "CTA") {
    const layer = defaultCtaLayer(id, zIndex, {
      enabled: true,
      destination: { type: "COMMUNITY" },
      label: opts?.ctaLabel ?? "시작하기",
    });
    return { ok: true, value: layer };
  }
  const kind = opts?.decorationKind ?? "shape";
  if (kind === "sticker" && !opts?.assetId?.trim()) {
    return { ok: false, error: "layer_asset_required" };
  }
  const decoration = defaultDecorationLayer(id, zIndex, kind);
  return {
    ok: true,
    value: opts?.assetId ? { ...decoration, assetId: opts.assetId } : decoration,
  };
}

export function applyFailedOrCancelledImageSelection(campaign: IntroAdminCampaign): IntroAdminCampaign {
  return campaign;
}

export function stripSessionGhostLayers(scene: IntroAdminScene): IntroAdminScene {
  const layers = scene.layers
    .filter((layer) => !isSessionGhostLayer(layer))
    .map((layer, index) => ({ ...layer, zIndex: index + 1 }));
  return { ...scene, layers };
}

export function prepareIntroWorkingDraft(campaign: IntroAdminCampaign): IntroAdminCampaign {
  const adapted = adaptOperatorDraftToCanonical(campaign);
  const scenes = adapted.scenes.map((scene) => stripSessionGhostLayers(scene));
  return {
    ...adapted,
    scenes,
    deviceOverrides: adapted.deviceOverrides,
  };
}

export function scenesForPersist(scenes: readonly IntroAdminScene[]): IntroAdminScene[] {
  return scenes.map((scene) => stripSessionGhostLayers(scene));
}

export function addSceneToCampaign(campaign: IntroAdminCampaign, name: string): IntroAdminCampaign {
  const next = defaultNewScene(nextSceneId(), nextSceneSortOrder(campaign.scenes), name);
  return { ...campaign, scenes: [...campaign.scenes, next] };
}

export function duplicateSceneInCampaign(
  campaign: IntroAdminCampaign,
  sceneId: string
): IntroAdminCampaign {
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  if (!scene) return campaign;
  const nextId = nextSceneId();
  const duplicated = duplicateScene(scene, nextId, nextSceneSortOrder(campaign.scenes));
  const layers = duplicated.layers.map((layer, index) => ({
    ...layer,
    id: nextLayerId(),
    zIndex: index + 1,
  }));
  const idMap = new Map(duplicated.layers.map((layer, index) => [layer.id, layers[index]!.id]));
  return {
    ...campaign,
    scenes: [
      ...campaign.scenes,
      {
        ...duplicated,
        layers,
        interactionLayerId: duplicated.interactionLayerId
          ? idMap.get(duplicated.interactionLayerId) ?? null
          : null,
      },
    ],
  };
}

export function deleteSceneFromCampaign(
  campaign: IntroAdminCampaign,
  sceneId: string
): IntroAdminCampaign {
  if (campaign.scenes.length <= 1) return campaign;
  const scenes = campaign.scenes
    .filter((scene) => scene.id !== sceneId)
    .map((scene, index) => ({ ...scene, sortOrder: index }));
  return { ...campaign, scenes };
}

export function addLayerToSelectedScene(
  campaign: IntroAdminCampaign,
  sceneId: string,
  type: IntroLayerType,
  opts?: { assetId?: string; decorationKind?: IntroDecorationKind; text?: string }
): ContractResult<IntroAdminCampaign> {
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, error: "scene_missing" };
  const created = createSemanticLayer(type, nextLayerId(), scene.layers.length + 1, opts);
  if (!created.ok) return created;
  let nextScene: IntroAdminScene = { ...scene, layers: [...scene.layers, created.value] };
  if (type === "CTA") {
    nextScene = {
      ...nextScene,
      cta: {
        enabled: true,
        destination: scene.cta?.destination ?? { type: "COMMUNITY" },
        label: created.value.text ?? "시작하기",
        xPct: created.value.xPct,
        yPct: created.value.yPct,
        widthPct: created.value.widthPct,
        heightPct: created.value.heightPct,
      },
    };
  }
  return {
    ok: true,
    value: {
      ...campaign,
      scenes: campaign.scenes.map((item) => (item.id === sceneId ? nextScene : item)),
    },
  };
}

export function duplicateLayerInScene(
  campaign: IntroAdminCampaign,
  sceneId: string,
  layerId: string
): IntroAdminCampaign {
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  const layer = scene?.layers.find((item) => item.id === layerId);
  if (!scene || !layer) return campaign;
  const next: IntroLayer = {
    ...layer,
    id: nextLayerId(),
    zIndex: scene.layers.length + 1,
  };
  return {
    ...campaign,
    scenes: campaign.scenes.map((item) =>
      item.id === sceneId ? { ...item, layers: [...item.layers, next] } : item
    ),
  };
}

export function deleteLayerFromScene(
  campaign: IntroAdminCampaign,
  sceneId: string,
  layerId: string
): IntroAdminCampaign {
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        layers: scene.layers
          .filter((layer) => layer.id !== layerId)
          .map((layer, index) => ({ ...layer, zIndex: index + 1 })),
      };
    }),
  };
}

export function setLayerVisibleInScene(
  campaign: IntroAdminCampaign,
  sceneId: string,
  layerId: string,
  visible: boolean
): IntroAdminCampaign {
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        layers: scene.layers.map((layer) => (layer.id === layerId ? { ...layer, visible } : layer)),
      };
    }),
  };
}

export function reorderLayersInScene(
  campaign: IntroAdminCampaign,
  sceneId: string,
  fromIndex: number,
  toIndex: number
): IntroAdminCampaign {
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
      return { ...scene, layers: reorderLayers(ordered, fromIndex, toIndex) };
    }),
  };
}

export function reorderScenesInCampaign(
  campaign: IntroAdminCampaign,
  fromIndex: number,
  toIndex: number
): IntroAdminCampaign {
  return { ...campaign, scenes: reorderScenes(campaign.scenes, fromIndex, toIndex) };
}

export function sceneAdvanceIsExplicit(scene: Pick<IntroAdminScene, "advanceMode" | "durationMs">): boolean {
  const mode = scene.advanceMode as IntroAdvanceMode;
  if (!INTRO_RESET2_ADVANCE_MODES.includes(mode as IntroReset2AdvanceMode)) return false;
  if (mode === "timer") return scene.durationMs != null && scene.durationMs >= 1;
  return true;
}

export function sceneTransitionIsDistinctFromLayerAnimation(
  scene: IntroAdminScene
): boolean {
  const transition = {
    type: scene.transition,
    duration: scene.transitionMs ?? 280,
    easing: scene.transitionEasing ?? "ease_out",
  };
  const layerAnimations = scene.layers.map((layer) => layer.animation);
  return !layerAnimations.some((animation) => animation === transition.type);
}

function clipText(value: string, max = 24): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function introLayerDisplayLabel(input: {
  layer: IntroLayer;
  assets: readonly IntroAdminAsset[];
  siblings: readonly IntroLayer[];
  lang: IntroLang;
}): string {
  const { layer, assets, siblings, lang } = input;
  const typeLabel = introLayerTypeLabel(layer.type, lang);
  const sameType = siblings.filter((item) => item.type === layer.type);
  const ordinal = sameType.findIndex((item) => item.id === layer.id) + 1;
  const needsOrdinal = sameType.length > 1;
  const asset = layer.assetId ? assets.find((item) => item.id === layer.assetId) : null;
  const fileName = asset ? introAssetFileName(asset) : null;
  const ordinalMark = needsOrdinal ? ` ${ordinal}` : "";

  if (layer.type === "IMAGE") {
    const role = lang === "en" ? "Main image" : "메인 이미지";
    if (fileName) return `${role}${ordinalMark} · ${fileName}`;
    return `${typeLabel}${ordinalMark} · ${lang === "en" ? "file pending" : "파일 없음"}`;
  }
  if (layer.type === "LOGO") {
    const role = lang === "en" ? "Logo" : "로고";
    if (fileName) return `${role}${ordinalMark} · ${fileName}`;
    return `${role}${ordinalMark} · ${lang === "en" ? "file pending" : "파일 없음"}`;
  }
  if (layer.type === "TEXT") {
    const role = introTextStyleLabel(layer.fontToken ?? "title", lang);
    const body = clipText(layer.text ?? "");
    return body ? `${role} · “${body}”` : `${role}${ordinalMark}`;
  }
  if (layer.type === "CTA") {
    const role = lang === "en" ? "Button" : "버튼";
    const body = clipText(layer.text ?? "");
    return body ? `${role} · “${body}”` : `${role}${ordinalMark}`;
  }
  if (layer.type === "DECORATION") {
    const role = lang === "en" ? "Decoration" : "장식";
    const kind = introDecorationKindLabel(layer.decorationKind ?? "shape", lang);
    if (layer.decorationKind === "sticker" && fileName) return `${role} · ${fileName}`;
    return `${role} · ${kind}`;
  }
  return `${typeLabel}${ordinalMark}`;
}

export function simulatePersistedReload(campaign: IntroAdminCampaign): IntroAdminCampaign {
  const scenes = scenesForPersist(campaign.scenes).map((scene, index) => ({
    ...scene,
    id: scene.id.startsWith("tmp-") ? `scene-persisted-${index + 1}` : scene.id,
    sortOrder: index,
  }));
  return prepareIntroWorkingDraft({ ...campaign, scenes });
}

export function layersOwnedByScene(
  campaign: IntroAdminCampaign,
  sceneId: string
): IntroLayer[] {
  return campaign.scenes.find((scene) => scene.id === sceneId)?.layers ?? [];
}

export function campaignHasDeviceSpecificSceneCopies(campaign: IntroAdminCampaign): boolean {
  const names = campaign.scenes.map((scene) => scene.name.toLowerCase());
  const deviceWords = ["phone", "tablet", "android", "ios", "ipad"];
  return (
    campaign.deviceOverrides.some((row) => (row.layers?.length ?? 0) > 0) ||
    names.some((name) => deviceWords.some((word) => name.includes(word)))
  );
}

export function patchSceneCtaDestination(
  campaign: IntroAdminCampaign,
  sceneId: string,
  destination: IntroCtaDestination
): IntroAdminCampaign {
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        cta: {
          enabled: scene.cta?.enabled ?? true,
          destination,
          label: scene.cta?.label ?? "시작하기",
        },
      };
    }),
  };
}

/** Editor must not call this for IMAGE/LOGO/BACKGROUND without a valid asset. */
export function editorMayCreateLayerType(type: IntroLayerType): boolean {
  return type === "TEXT" || type === "CTA" || type === "DECORATION";
}

export { createLayerOfType, nextLayerId, reorderLayers, reorderScenes };
