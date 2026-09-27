/**
 * Phase 2 publish compatibility gate.
 * Current Native is one-image CONTAIN + timer + optional typed CTA.
 * Rich Phase 2 drafts must not flatten or publish through V1.
 */

import type { IntroAdminCampaign, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroAnimationMeta, IntroLayer } from "@/lib/startup/intro-v2/types";

type IntroCompatIssue = {
  code: string;
  path: string;
  messageKo: string;
  messageEn: string;
};

export const INTRO_RICH_PUBLISH_BLOCKED_CODE = "rich_runtime_not_ready" as const;

export const INTRO_RICH_PUBLISH_MESSAGE_KO = "새 Intro 런타임 게시 지원 준비 중" as const;
export const INTRO_RICH_PUBLISH_MESSAGE_EN =
  "Rich Intro publish is not ready for the current Native runtime." as const;

function animationIsRich(animation: IntroLayer["animation"]): boolean {
  if (animation == null || typeof animation === "string") return false;
  const meta = animation as IntroAnimationMeta;
  return (["enter", "emphasis", "exit"] as const).some((phase) => {
    const clip = meta[phase];
    return Boolean(clip && clip.type && clip.type !== "none");
  });
}

function layerIsRich(layer: IntroLayer): boolean {
  if (layer.type === "TEXT" || layer.type === "LOGO" || layer.type === "DECORATION") return true;
  if (layer.type === "BACKGROUND") return true;
  if (layer.type === "CTA") return true;
  if (animationIsRich(layer.animation)) return true;
  if (layer.type === "IMAGE" && layer.aspectPolicy && layer.aspectPolicy !== "contain") return true;
  return false;
}

export function introRichCompositionReasons(campaign: IntroAdminCampaign): string[] {
  const reasons: string[] = [];
  if (campaign.scenes.length !== 1) reasons.push("multiple_scenes");
  const scene: IntroAdminScene | undefined = campaign.scenes[0];
  if (!scene) {
    reasons.push("no_scene");
    return reasons;
  }
  const visible = scene.layers.filter((layer) => layer.visible !== false);
  const images = visible.filter((layer) => layer.type === "IMAGE");
  if (images.length !== 1) reasons.push(images.length === 0 ? "no_image" : "multiple_images");
  for (const layer of visible) {
    if (layerIsRich(layer)) reasons.push(`layer_${layer.type.toLowerCase()}`);
  }
  return [...new Set(reasons)];
}

export function isV1CompatibleIntroComposition(campaign: IntroAdminCampaign): boolean {
  return introRichCompositionReasons(campaign).length === 0;
}

export function introRichPublishBlockIssue(campaign: IntroAdminCampaign): IntroCompatIssue | null {
  const reasons = introRichCompositionReasons(campaign);
  if (reasons.length === 0) return null;
  return {
    code: INTRO_RICH_PUBLISH_BLOCKED_CODE,
    path: "publish.runtime",
    messageKo: INTRO_RICH_PUBLISH_MESSAGE_KO,
    messageEn: INTRO_RICH_PUBLISH_MESSAGE_EN,
  };
}
