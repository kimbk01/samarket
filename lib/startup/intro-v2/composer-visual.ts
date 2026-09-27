/**
 * Intro V2 Composer visual defaults — normalized %, no CSS pixel persistence.
 */

import type { IntroCta, IntroLayer, IntroLayerType, IntroTextAlign } from "@/lib/startup/intro-v2/types";

export const INTRO_CREATIVE_RECOMMENDED_WIDTH = 1080;
export const INTRO_CREATIVE_RECOMMENDED_HEIGHT = 1350;
export const INTRO_CREATIVE_ASPECT = 4 / 5;

export const DEFAULT_CTA_VISUAL: Required<
  Pick<
    IntroCta,
    | "label"
    | "xPct"
    | "yPct"
    | "widthPct"
    | "heightPct"
    | "fontSizePct"
    | "fontWeight"
    | "cornerRadiusPct"
    | "opacity"
    | "align"
  >
> = {
  label: "시작하기",
  xPct: 50,
  yPct: 86,
  widthPct: 56,
  heightPct: 8,
  fontSizePct: 3.2,
  fontWeight: 700,
  cornerRadiusPct: 24,
  opacity: 1,
  align: "center",
};

export function defaultTextLayerVisual(): Pick<
  IntroLayer,
  "fontSizePct" | "fontWeight" | "lineHeight" | "textAlign" | "maxWidthPct" | "widthPct" | "heightPct" | "opacity"
> {
  return {
    fontSizePct: 4.2,
    fontWeight: 700,
    lineHeight: 1.3,
    textAlign: "center",
    maxWidthPct: 80,
    widthPct: 70,
    heightPct: 12,
    opacity: 1,
  };
}

export function defaultComposerLayer(type: IntroLayerType, id: string, zIndex: number): IntroLayer {
  const textVisual = defaultTextLayerVisual();
  const names: Record<IntroLayerType, string> = {
    BACKGROUND: "배경",
    IMAGE: "이미지",
    LOGO: "로고",
    TEXT: "텍스트",
    CTA: "버튼",
    DECORATION: "장식",
  };
  return {
    id,
    type,
    zIndex,
    name: names[type],
    anchor: "center",
    xPct: 50,
    yPct: type === "TEXT" ? 72 : type === "CTA" ? 86 : 50,
    widthPct: type === "BACKGROUND" ? 100 : type === "TEXT" ? textVisual.widthPct : 80,
    heightPct: type === "BACKGROUND" ? 100 : type === "TEXT" ? textVisual.heightPct : 60,
    opacity: 1,
    safeArea: true,
    aspectPolicy: "contain",
    ...(type === "TEXT"
      ? {
          text: "텍스트",
          fontSizePct: textVisual.fontSizePct,
          fontWeight: textVisual.fontWeight,
          lineHeight: textVisual.lineHeight,
          textAlign: textVisual.textAlign,
          maxWidthPct: textVisual.maxWidthPct,
        }
      : {}),
  };
}

export function layerDisplayName(layer: Pick<IntroLayer, "name" | "type" | "text">, fallbackType: string): string {
  const named = layer.name?.trim();
  if (named) return named;
  const text = layer.text?.trim();
  if (layer.type === "TEXT" && text) return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  return fallbackType;
}

export function clampPct(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function creativeAspectWarning(width: number | null | undefined, height: number | null | undefined): boolean {
  if (!width || !height || width < 1 || height < 1) return false;
  if (width !== INTRO_CREATIVE_RECOMMENDED_WIDTH || height !== INTRO_CREATIVE_RECOMMENDED_HEIGHT) return true;
  const ratio = width / height;
  return Math.abs(ratio - INTRO_CREATIVE_ASPECT) > 0.02;
}

export function formatAspect(width: number, height: number): string {
  if (width < 1 || height < 1) return "—";
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function withCtaVisual(cta: IntroCta | null | undefined): IntroCta {
  const base = cta ?? { enabled: false, destination: { type: "COMMUNITY" as const } };
  return {
    ...base,
    label: base.label?.trim() || DEFAULT_CTA_VISUAL.label,
    xPct: base.xPct ?? DEFAULT_CTA_VISUAL.xPct,
    yPct: base.yPct ?? DEFAULT_CTA_VISUAL.yPct,
    widthPct: base.widthPct ?? DEFAULT_CTA_VISUAL.widthPct,
    heightPct: base.heightPct ?? DEFAULT_CTA_VISUAL.heightPct,
    fontSizePct: base.fontSizePct ?? DEFAULT_CTA_VISUAL.fontSizePct,
    fontWeight: base.fontWeight ?? DEFAULT_CTA_VISUAL.fontWeight,
    cornerRadiusPct: base.cornerRadiusPct ?? DEFAULT_CTA_VISUAL.cornerRadiusPct,
    opacity: base.opacity ?? DEFAULT_CTA_VISUAL.opacity,
    align: (base.align ?? DEFAULT_CTA_VISUAL.align) as IntroTextAlign,
  };
}

export function fitStageToWorkspace(
  frameW: number,
  frameH: number,
  maxW: number,
  maxH: number
): { width: number; height: number; scale: number } {
  const scale = Math.min(maxW / frameW, maxH / frameH, 1);
  return {
    width: Math.round(frameW * scale),
    height: Math.round(frameH * scale),
    scale,
  };
}
