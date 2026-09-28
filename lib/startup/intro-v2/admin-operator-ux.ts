/**
 * Operator-facing Intro CMS helpers.
 * Typed values stay underneath; operators never need UUIDs or raw enums.
 */

import type { IntroAdminAsset, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import { emptyAnimationMeta } from "@/lib/startup/intro-v2/composition";
import type { IntroLang } from "@/lib/startup/intro-v2/admin-labels";
import type {
  IntroAnimationMeta,
  IntroCta,
  IntroCtaDestination,
  IntroCtaDestinationType,
} from "@/lib/startup/intro-v2/types";

export const INTRO_OPERATOR_CTA_DESTINATIONS = [
  "COMMUNITY",
  "TRADE",
  "DELIVERY",
  "EVENT",
  "INTERNAL_PATH",
  "EXTERNAL_URL",
] as const;

export type IntroOperatorCtaDestination = (typeof INTRO_OPERATOR_CTA_DESTINATIONS)[number];

export const INTRO_OPERATOR_ANIMATION_PRESETS = [
  "none",
  "fade_in",
  "slide_up",
  "scale_up",
  "scale_down",
  "fade_out",
] as const;

export type IntroOperatorAnimationPreset = (typeof INTRO_OPERATOR_ANIMATION_PRESETS)[number];

const ANIMATION_PRESET: Record<IntroOperatorAnimationPreset, { ko: string; en: string }> = {
  none: { ko: "없음", en: "None" },
  fade_in: { ko: "페이드 인", en: "Fade in" },
  slide_up: { ko: "아래에서 등장", en: "Slide up" },
  scale_up: { ko: "확대", en: "Scale up" },
  scale_down: { ko: "축소", en: "Scale down" },
  fade_out: { ko: "페이드 아웃", en: "Fade out" },
};

export function introOperatorAnimationLabel(
  preset: IntroOperatorAnimationPreset,
  lang: IntroLang
): string {
  return lang === "en" ? ANIMATION_PRESET[preset].en : ANIMATION_PRESET[preset].ko;
}

export function inferOperatorAnimationPreset(
  animation: IntroAnimationMeta | string | undefined
): IntroOperatorAnimationPreset {
  if (!animation || typeof animation === "string") return "none";
  if (animation.enter?.type === "fade") return "fade_in";
  if (animation.enter?.type === "slide") return "slide_up";
  if (animation.enter?.type === "scale") return "scale_up";
  if (animation.exit?.type === "scale") return "scale_down";
  if (animation.exit?.type === "fade") return "fade_out";
  return "none";
}

export function applyOperatorAnimationPreset(preset: IntroOperatorAnimationPreset): IntroAnimationMeta {
  const base = emptyAnimationMeta();
  if (preset === "none") return base;
  if (preset === "fade_in") {
    return { ...base, enter: { type: "fade", durationMs: 280, delayMs: 0, easing: "ease_out", repeat: "none" } };
  }
  if (preset === "slide_up") {
    return { ...base, enter: { type: "slide", durationMs: 320, delayMs: 0, easing: "ease_out", repeat: "none" } };
  }
  if (preset === "scale_up") {
    return { ...base, enter: { type: "scale", durationMs: 280, delayMs: 0, easing: "ease_out", repeat: "none" } };
  }
  if (preset === "scale_down") {
    return { ...base, exit: { type: "scale", durationMs: 240, delayMs: 0, easing: "ease_in", repeat: "none" } };
  }
  return { ...base, exit: { type: "fade", durationMs: 240, delayMs: 0, easing: "ease_in", repeat: "none" } };
}

export function applyOperatorCtaDestination(
  current: IntroCta | null,
  type: IntroCtaDestinationType
): IntroCta {
  const destination: IntroCtaDestination =
    type === "INTERNAL_PATH"
      ? { type, path: current?.destination.path || "/philife" }
      : type === "EXTERNAL_URL"
        ? { type, url: current?.destination.url || "" }
        : { type };
  return {
    ...(current ?? { enabled: true, label: "시작하기" }),
    enabled: true,
    destination,
  };
}

export function introAssetFileName(asset: Pick<IntroAdminAsset, "storagePath" | "publicUrl">): string {
  const fromPath = asset.storagePath.split("/").filter(Boolean).at(-1);
  if (fromPath) return fromPath;
  try {
    const url = asset.publicUrl ? new URL(asset.publicUrl) : null;
    const fromUrl = url?.pathname.split("/").filter(Boolean).at(-1);
    if (fromUrl) return decodeURIComponent(fromUrl);
  } catch {
    /* ignore */
  }
  return "image";
}

export function introFormatBytes(bytes: number | null): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

export function introAspectRatioLabel(width: number | null, height: number | null): string {
  if (!(width && width > 0) || !(height && height > 0)) return "—";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

export function introSceneDurationLabel(scene: IntroAdminScene, lang: IntroLang): string {
  if (scene.advanceMode === "timer" && scene.durationMs != null) {
    return `${(scene.durationMs / 1000).toFixed(1)}s`;
  }
  if (scene.advanceMode === "media_end") return lang === "en" ? "media end" : "미디어 종료";
  if (scene.advanceMode === "cta_only") return "CTA";
  return lang === "en" ? "manual" : "직접";
}

export function introPublishedAssetIds(campaign: {
  published: { id: string } | null;
  assets: readonly IntroAdminAsset[];
  scenes: readonly IntroAdminScene[];
}): Set<string> {
  if (!campaign.published) return new Set();
  const ids = new Set<string>();
  for (const scene of campaign.scenes) {
    if (scene.backgroundAssetId) ids.add(scene.backgroundAssetId);
    for (const layer of scene.layers) {
      if (layer.assetId) ids.add(layer.assetId);
    }
  }
  return ids;
}

export function canDestructivelyRemoveIntroAsset(input: {
  assetId: string;
  published: { id: string } | null;
  referenced: boolean;
}): boolean {
  if (input.published && input.referenced) return false;
  return true;
}

export type IntroUploadAttachIntent = "image" | "logo" | "background" | "replace";

function layerAcceptsIntroAsset(layer: { type: string; decorationKind?: string | null }): boolean {
  return (
    layer.type === "IMAGE" ||
    layer.type === "LOGO" ||
    layer.type === "BACKGROUND" ||
    (layer.type === "DECORATION" && layer.decorationKind === "sticker")
  );
}

/** Late uploads attach to the intended media layer and must not steal a later TEXT/CTA selection. */
export function resolveIntroUploadAttach(input: {
  layers: readonly { id: string; type: string; decorationKind?: string | null }[];
  selectedLayerId: string | null;
  intendedLayerId: string | null;
  intent: IntroUploadAttachIntent;
}): {
  targetLayerId: string | null;
  createType: "IMAGE" | "LOGO" | null;
  selectAfter: boolean;
} {
  if (input.intent === "background") {
    return { targetLayerId: null, createType: null, selectAfter: false };
  }
  const intended = input.intendedLayerId
    ? input.layers.find((layer) => layer.id === input.intendedLayerId && layerAcceptsIntroAsset(layer))
    : undefined;
  if (intended) {
    return {
      targetLayerId: intended.id,
      createType: null,
      selectAfter: !input.selectedLayerId || input.selectedLayerId === intended.id,
    };
  }
  const selected = input.selectedLayerId
    ? input.layers.find((layer) => layer.id === input.selectedLayerId && layerAcceptsIntroAsset(layer))
    : undefined;
  if (selected) {
    return { targetLayerId: selected.id, createType: null, selectAfter: true };
  }
  return {
    targetLayerId: null,
    createType: null,
    selectAfter: false,
  };
}
