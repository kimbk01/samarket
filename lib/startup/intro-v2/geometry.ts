/**
 * Phase 2 canonical geometry SSOT.
 * Persisted authority is normalized % + safeArea + anchor + aspect + min/max.
 * CSS pixels and preview viewports are never stored.
 */

import type { IntroAspectPolicy, IntroLayer, IntroLayerAnchor } from "@/lib/startup/intro-v2/types";

export type IntroSurfaceInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type IntroViewportSize = {
  width: number;
  height: number;
};

export type IntroUsableRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IntroRenderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const INTRO_GEOMETRY_SSOT = "normalized_pct_safearea_anchor_aspect" as const;

/** Actual Intro Scene surface = the startup viewport. Not an inner poster box. */
export function introSceneSurfaceRect(viewport: IntroViewportSize): IntroUsableRect {
  return {
    x: 0,
    y: 0,
    width: Math.max(1, viewport.width),
    height: Math.max(1, viewport.height),
  };
}

/** Background always fills the complete Scene surface. */
export function introBackgroundSurfaceRect(viewport: IntroViewportSize): IntroRenderRect {
  const surface = introSceneSurfaceRect(viewport);
  return { ...surface };
}

export function introMediaAspectRatio(naturalWidth: number, naturalHeight: number): number | null {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null;
  return naturalWidth / naturalHeight;
}

export function introLockedHeightPct(
  widthPct: number,
  aspect: number,
  surfaceWidth: number,
  surfaceHeight: number
): number {
  if (!(aspect > 0) || !(surfaceHeight > 0)) return widthPct;
  const widthPx = (widthPct / 100) * surfaceWidth;
  const heightPx = widthPx / aspect;
  return Math.round((heightPx / surfaceHeight) * 1000) / 10;
}

export function introLockedWidthPct(
  heightPct: number,
  aspect: number,
  surfaceWidth: number,
  surfaceHeight: number
): number {
  if (!(aspect > 0) || !(surfaceWidth > 0)) return heightPct;
  const heightPx = (heightPct / 100) * surfaceHeight;
  const widthPx = heightPx * aspect;
  return Math.round((widthPx / surfaceWidth) * 1000) / 10;
}

export function introUsableSceneRect(
  viewport: IntroViewportSize,
  insets: IntroSurfaceInsets,
  safeArea: boolean
): IntroUsableRect {
  if (!safeArea) return introSceneSurfaceRect(viewport);
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const left = Math.max(0, insets.left);
  const top = Math.max(0, insets.top);
  const right = Math.max(0, insets.right);
  const bottom = Math.max(0, insets.bottom);
  return {
    x: left,
    y: top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

function anchorFractions(anchor: IntroLayerAnchor): { x: number; y: number } {
  const x = anchor.endsWith("left") ? 0 : anchor.endsWith("right") ? 1 : 0.5;
  const y = anchor.startsWith("top") ? 0 : anchor.startsWith("bottom") ? 1 : 0.5;
  return { x, y };
}

export function layerUsesSafeArea(layer: Pick<IntroLayer, "type" | "safeArea">): boolean {
  if (typeof layer.safeArea === "boolean") return layer.safeArea;
  return layer.type !== "BACKGROUND";
}

export function transformLayerToRect(input: {
  layer: Pick<
    IntroLayer,
    | "anchor"
    | "xPct"
    | "yPct"
    | "widthPct"
    | "heightPct"
    | "minWidthPct"
    | "maxWidthPct"
    | "safeArea"
    | "type"
    | "aspectPolicy"
  >;
  viewport: IntroViewportSize;
  insets: IntroSurfaceInsets;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}): IntroRenderRect {
  if (input.layer.type === "BACKGROUND") {
    return introBackgroundSurfaceRect(input.viewport);
  }
  const usable = introUsableSceneRect(input.viewport, input.insets, layerUsesSafeArea(input.layer));
  const ax = ((input.layer.xPct ?? 50) / 100) * usable.width;
  const ay = ((input.layer.yPct ?? 50) / 100) * usable.height;
  let boxW = ((input.layer.widthPct ?? 40) / 100) * usable.width;
  let boxH = ((input.layer.heightPct ?? 20) / 100) * usable.height;
  const minW =
    input.layer.minWidthPct != null ? (input.layer.minWidthPct / 100) * usable.width : 1;
  const maxW =
    input.layer.maxWidthPct != null ? (input.layer.maxWidthPct / 100) * usable.width : usable.width;
  boxW = Math.min(maxW, Math.max(minW, boxW));
  boxH = Math.max(1, boxH);

  const frac = anchorFractions(input.layer.anchor);
  let x = usable.x + ax - boxW * frac.x;
  let y = usable.y + ay - boxH * frac.y;
  let width = boxW;
  let height = boxH;

  const policy: IntroAspectPolicy = input.layer.aspectPolicy ?? "none";
  const mw = input.mediaWidth != null && input.mediaWidth > 0 ? input.mediaWidth : null;
  const mh = input.mediaHeight != null && input.mediaHeight > 0 ? input.mediaHeight : null;
  if (mw && mh && (policy === "contain" || policy === "cover" || policy === "none")) {
    const mediaRatio = mw / mh;
    const boxRatio = boxW / boxH;
    if (policy === "contain") {
      if (mediaRatio > boxRatio) {
        height = boxW / mediaRatio;
        y = usable.y + ay - height * frac.y;
      } else {
        width = boxH * mediaRatio;
        x = usable.x + ax - width * frac.x;
      }
    } else if (policy === "cover") {
      if (mediaRatio > boxRatio) {
        width = boxH * mediaRatio;
        x = usable.x + ax - width * frac.x;
      } else {
        height = boxW / mediaRatio;
        y = usable.y + ay - height * frac.y;
      }
    } else if (policy === "none") {
      const scale = Math.min(boxW / mw, boxH / mh, 1);
      width = Math.max(1, mw * scale);
      height = Math.max(1, mh * scale);
      x = usable.x + ax - width * frac.x;
      y = usable.y + ay - height * frac.y;
    }
  }

  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

export function introTextFontSizePx(fontSizePct: number | undefined, usableHeight: number): number {
  const pct = fontSizePct ?? 3.2;
  return Math.max(8, Math.round((pct / 100) * usableHeight));
}

export function sizePresetToCanonicalGeometry(preset: "small" | "medium" | "large" | "max"): {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  anchor: IntroLayerAnchor;
  aspectPolicy: IntroAspectPolicy;
  safeArea: boolean;
} {
  const scale = preset === "small" ? 56 : preset === "medium" ? 72 : preset === "large" ? 88 : 100;
  return {
    xPct: 50,
    yPct: 50,
    widthPct: scale,
    heightPct: scale,
    anchor: "center",
    aspectPolicy: "contain",
    safeArea: false,
  };
}
