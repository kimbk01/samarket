/**
 * Phase 2 canonical Scene / Layer factories and identities.
 * Preview and Save consume this model. Native rich renderer is out of scope.
 */

import { INTRO_ADMIN_DEFAULT_MAX_HOLD_MS } from "@/lib/startup/intro-v2/admin-labels";
import type { IntroAdminCampaign, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import type {
  IntroAnimationMeta,
  IntroAspectPolicy,
  IntroCta,
  IntroDecorationKind,
  IntroFontToken,
  IntroLayer,
  IntroLayerType,
} from "@/lib/startup/intro-v2/types";

export const INTRO_PHASE2_FAILSAFE_MAX_HOLD_MS = INTRO_ADMIN_DEFAULT_MAX_HOLD_MS;

export const INTRO_DEFAULT_TRANSITION_MS = 280 as const;
export const INTRO_DEFAULT_TRANSITION_EASING = "ease_out" as const;

export function emptyAnimationMeta(): IntroAnimationMeta {
  return {
    enter: { type: "none", durationMs: 0, delayMs: 0, easing: "ease_out", repeat: "none" },
    emphasis: { type: "none", durationMs: 0, delayMs: 0, easing: "ease_out", repeat: "none" },
    exit: { type: "none", durationMs: 0, delayMs: 0, easing: "ease_out", repeat: "none" },
  };
}

export function nextLayerId(prefix = "tmp-l"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function baseLayer(input: {
  id: string;
  type: IntroLayerType;
  zIndex: number;
  name: string;
  safeArea: boolean;
}): IntroLayer {
  return {
    id: input.id,
    type: input.type,
    zIndex: input.zIndex,
    anchor: "center",
    name: input.name,
    visible: true,
    xPct: 50,
    yPct: 50,
    widthPct: 80,
    heightPct: 20,
    opacity: 1,
    rotation: 0,
    safeArea: input.safeArea,
    animation: emptyAnimationMeta(),
  };
}

export function defaultBackgroundLayer(id: string, zIndex: number, color = "#111827"): IntroLayer {
  return {
    ...baseLayer({ id, type: "BACKGROUND", zIndex, name: "Background", safeArea: false }),
    xPct: 50,
    yPct: 50,
    widthPct: 100,
    heightPct: 100,
    color,
    aspectPolicy: "fill",
  };
}

export function defaultImageLayer(
  id: string,
  zIndex: number,
  aspectPolicy: IntroAspectPolicy = "contain"
): IntroLayer {
  return {
    ...baseLayer({ id, type: "IMAGE", zIndex, name: "Image", safeArea: true }),
    widthPct: 80,
    heightPct: 60,
    aspectPolicy,
  };
}

export function defaultLogoLayer(id: string, zIndex: number): IntroLayer {
  return {
    ...baseLayer({ id, type: "LOGO", zIndex, name: "Logo", safeArea: true }),
    xPct: 50,
    yPct: 12,
    widthPct: 28,
    heightPct: 10,
    aspectPolicy: "contain",
  };
}

export function defaultTextLayer(id: string, zIndex: number, text = "텍스트"): IntroLayer {
  return {
    ...baseLayer({ id, type: "TEXT", zIndex, name: "Text", safeArea: true }),
    yPct: 28,
    widthPct: 80,
    heightPct: 16,
    text,
    fontToken: "title" as IntroFontToken,
    fontSizePct: 4.2,
    fontWeight: 700,
    lineHeight: 1.3,
    textAlign: "center",
    wrap: true,
    maxLines: 3,
    color: "#111827",
  };
}

export function defaultCtaLayer(id: string, zIndex: number, cta?: IntroCta | null): IntroLayer {
  return {
    ...baseLayer({ id, type: "CTA", zIndex, name: "CTA", safeArea: true }),
    xPct: cta?.xPct ?? 50,
    yPct: cta?.yPct ?? 86,
    widthPct: cta?.widthPct ?? 56,
    heightPct: cta?.heightPct ?? 8,
    text: cta?.label ?? "시작하기",
    fontSizePct: cta?.fontSizePct ?? 3.2,
    fontWeight: cta?.fontWeight ?? 700,
    textAlign: cta?.align ?? "center",
    color: "#ffffff",
    fillColor: "#111827",
    cornerRadiusPct: cta?.cornerRadiusPct ?? 24,
    opacity: cta?.opacity ?? 1,
  };
}

export function defaultDecorationLayer(
  id: string,
  zIndex: number,
  kind: IntroDecorationKind = "shape"
): IntroLayer {
  return {
    ...baseLayer({ id, type: "DECORATION", zIndex, name: "Decoration", safeArea: true }),
    yPct: 72,
    widthPct: kind === "divider" ? 64 : 18,
    heightPct: kind === "divider" ? 1.2 : 8,
    decorationKind: kind,
    fillColor: kind === "divider" ? "#d4d4d8" : "#a855f7",
    opacity: 1,
    cornerRadiusPct: kind === "shape" ? 50 : 0,
    aspectPolicy: kind === "sticker" ? "contain" : "none",
  };
}

export function createLayerOfType(type: IntroLayerType, id: string, zIndex: number): IntroLayer {
  if (type === "BACKGROUND") return defaultBackgroundLayer(id, zIndex);
  if (type === "IMAGE") return defaultImageLayer(id, zIndex);
  if (type === "LOGO") return defaultLogoLayer(id, zIndex);
  if (type === "TEXT") return defaultTextLayer(id, zIndex);
  if (type === "CTA") return defaultCtaLayer(id, zIndex);
  return defaultDecorationLayer(id, zIndex);
}

export function layerIsVisible(layer: IntroLayer): boolean {
  return layer.visible !== false;
}

export function introCompositionIdentities(input: {
  campaignId: string;
  scene: IntroAdminScene;
}): {
  campaignId: string;
  sceneId: string;
  layerIds: string[];
  assetIds: string[];
  texts: string[];
  ctaTarget: string;
  zOrder: string[];
} {
  const layers = [...input.scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const dest = input.scene.cta?.destination;
  const ctaTarget = dest
    ? dest.type === "EXTERNAL_URL"
      ? dest.url ?? ""
      : dest.type === "INTERNAL_PATH"
        ? dest.path ?? ""
        : dest.id ?? dest.type
    : "";
  return {
    campaignId: input.campaignId,
    sceneId: input.scene.id,
    layerIds: layers.map((layer) => layer.id),
    assetIds: layers.map((layer) => layer.assetId ?? "").filter(Boolean),
    texts: layers.filter((layer) => layer.type === "TEXT").map((layer) => layer.text ?? ""),
    ctaTarget,
    zOrder: layers.map((layer) => layer.id),
  };
}

export function introPreviewMutationCount(): 0 {
  return 0;
}

export function campaignHasDeviceCreativeOverrides(campaign: Pick<IntroAdminCampaign, "deviceOverrides">): boolean {
  return campaign.deviceOverrides.some(
    (row) => (row.layers?.length ?? 0) > 0 || Boolean(row.backgroundAssetId)
  );
}

export function sceneHasEndingMedia(
  scene: IntroAdminScene,
  assets: readonly { id: string; kind: string; mime?: string | null; durationMs?: number | null }[]
): boolean {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const ids = [
    scene.backgroundAssetId,
    ...scene.layers.map((layer) => layer.assetId),
  ].filter((id): id is string => Boolean(id));
  return ids.some((id) => {
    const asset = byId.get(id);
    if (!asset) return false;
    const mime = (asset.mime ?? "").toLowerCase();
    if (asset.kind === "gif" || asset.kind === "video") return true;
    if (mime.includes("gif") || mime.startsWith("video/")) return true;
    return (asset.durationMs ?? 0) > 0 && asset.kind !== "image";
  });
}
