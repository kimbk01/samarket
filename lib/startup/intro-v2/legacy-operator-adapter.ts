/**
 * Compatibility READ adapter only.
 * Executes once per campaign GET / successful save hydrate in AdminIntroCmsEditorPage.applyLoaded
 * via prepareIntroWorkingDraft. Must not become live CMS authority, add Layers, or
 * rewrite sizePreset-derived content as a second document.
 */

import { sizePresetToCanonicalGeometry } from "@/lib/startup/intro-v2/geometry";
import { emptyAnimationMeta } from "@/lib/startup/intro-v2/composition";
import type { IntroAdminCampaign, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import { operatorSizePreset, readOperatorSource } from "@/lib/startup/intro-operator-contract";
import type { IntroLayer } from "@/lib/startup/intro-v2/types";

export const INTRO_SIZE_PRESET_FINAL_AUTHORITY = false;

export type IntroOperatorMigrationRecord = {
  adapted: boolean;
  sizePresetFinalAuthority: false;
  mappedBackground: boolean;
  mappedImage: boolean;
  mappedCta: boolean;
  mappedTimer: boolean;
};

function imageNeedsCanonicalGeometry(layer: IntroLayer): boolean {
  return layer.xPct == null || layer.yPct == null || layer.widthPct == null || layer.heightPct == null;
}

export function adaptOperatorSceneToCanonical(
  scene: IntroAdminScene,
  source: Record<string, unknown>
): IntroAdminScene {
  const extras = readOperatorSource(source);
  const geometry = sizePresetToCanonicalGeometry(operatorSizePreset(extras.sizePreset));
  const layers = scene.layers.map((layer) => {
    if (layer.type !== "IMAGE") {
      return {
        ...layer,
        visible: layer.visible !== false,
        animation: layer.animation ?? emptyAnimationMeta(),
      };
    }
    if (!layer.assetId) {
      return {
        ...layer,
        visible: layer.visible !== false,
        animation: layer.animation ?? emptyAnimationMeta(),
      };
    }
    if (!imageNeedsCanonicalGeometry(layer)) {
      return {
        ...layer,
        visible: layer.visible !== false,
        aspectPolicy: layer.aspectPolicy ?? "contain",
        animation: layer.animation ?? emptyAnimationMeta(),
      };
    }
    return {
      ...layer,
      ...geometry,
      visible: layer.visible !== false,
      animation: layer.animation ?? emptyAnimationMeta(),
    };
  });
  return {
    ...scene,
    layers,
    transitionMs: scene.transitionMs ?? 280,
    transitionEasing: scene.transitionEasing ?? "ease_out",
    maxHoldMs: scene.maxHoldMs ?? scene.durationMs ?? extras.displayDurationMs,
  };
}

export function adaptOperatorDraftToCanonical(campaign: IntroAdminCampaign): IntroAdminCampaign {
  const scenes = campaign.scenes.map((scene) => adaptOperatorSceneToCanonical(scene, campaign.source));
  return {
    ...campaign,
    scenes,
    source: {
      ...campaign.source,
      sizePresetFinalAuthority: false,
      operatorMigratedToCanonical: true,
    },
    deviceOverrides: campaign.deviceOverrides,
  };
}

export function describeOperatorMigration(campaign: IntroAdminCampaign): IntroOperatorMigrationRecord {
  const scene = campaign.scenes[0];
  return {
    adapted: campaign.source.operatorMigratedToCanonical === true,
    sizePresetFinalAuthority: false,
    mappedBackground: Boolean(scene?.backgroundColor),
    mappedImage: Boolean(scene?.layers.some((layer) => layer.type === "IMAGE" && layer.assetId)),
    mappedCta: Boolean(scene?.cta),
    mappedTimer: scene?.advanceMode === "timer" && (scene.durationMs ?? 0) >= 1,
  };
}
