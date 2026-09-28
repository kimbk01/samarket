/**
 * V3 geometry: SCENE_NORMALIZED_PCT + 9-point anchor + CONTAIN/COVER.
 * CSS pixels and preview viewports are never persisted.
 * STRETCH is not in the enum.
 *
 * Math is the existing intro-v2 primitive (KEEP), re-exported — not a second formula.
 */

import {
  transformLayerToRect,
  type IntroRenderRect,
  type IntroViewportSize,
} from "@/lib/startup/intro-v2/geometry";
import type { IntroLayerAnchor } from "@/lib/startup/intro-v2/types";

export {
  INTRO_GEOMETRY_SSOT,
  introBackgroundSurfaceRect,
  introLockedHeightPct,
  introLockedWidthPct,
  introMediaAspectRatio,
  introSceneSurfaceRect,
  introUsableSceneRect,
  transformLayerToRect,
  type IntroRenderRect,
  type IntroSurfaceInsets,
  type IntroUsableRect,
  type IntroViewportSize,
} from "@/lib/startup/intro-v2/geometry";

export const INTRO_V3_GEOMETRY_SSOT = "SCENE_NORMALIZED_PCT" as const;

export const INTRO_V3_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type IntroV3Anchor = (typeof INTRO_V3_ANCHORS)[number];

export const INTRO_V3_FITS = ["CONTAIN", "COVER"] as const;
export type IntroV3Fit = (typeof INTRO_V3_FITS)[number];

export type IntroV3Geometry = {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  anchor: IntroV3Anchor;
  fit: IntroV3Fit;
  safeArea: boolean;
};

const CSS_PERSIST_RE = /(\d+(\.\d+)?)(px|rem|em|vw|vh|%)|calc\(|translate|matrix/i;

export function defaultIntroV3ImageGeometry(): IntroV3Geometry {
  return {
    xPct: 50,
    yPct: 50,
    widthPct: 72,
    heightPct: 40,
    anchor: "middle-center",
    fit: "CONTAIN",
    safeArea: true,
  };
}

export function defaultIntroV3LogoGeometry(): IntroV3Geometry {
  return {
    xPct: 50,
    yPct: 18,
    widthPct: 36,
    heightPct: 12,
    anchor: "top-center",
    fit: "CONTAIN",
    safeArea: true,
  };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

export function normalizeIntroV3Geometry(raw: unknown): IntroV3Geometry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  for (const value of Object.values(rec)) {
    if (typeof value === "string" && CSS_PERSIST_RE.test(value) && !INTRO_V3_ANCHORS.includes(value as IntroV3Anchor)) {
      return null;
    }
  }
  if ("xPx" in rec || "yPx" in rec || "widthPx" in rec || "heightPx" in rec || "css" in rec) {
    return null;
  }
  const fit = rec.fit;
  if (fit === "STRETCH" || (typeof fit === "string" && !(INTRO_V3_FITS as readonly string[]).includes(fit))) {
    return null;
  }
  const anchor = rec.anchor;
  if (typeof anchor !== "string" || !(INTRO_V3_ANCHORS as readonly string[]).includes(anchor)) {
    return null;
  }
  return {
    xPct: clampPct(Number(rec.xPct)),
    yPct: clampPct(Number(rec.yPct)),
    widthPct: clampPct(Number(rec.widthPct) || 1),
    heightPct: clampPct(Number(rec.heightPct) || 1),
    anchor: anchor as IntroV3Anchor,
    fit: fit === "COVER" ? "COVER" : "CONTAIN",
    safeArea: rec.safeArea !== false,
  };
}

export function introV3GeometryHasCssPixels(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  return "xPx" in rec || "yPx" in rec || "widthPx" in rec || "heightPx" in rec;
}

const V3_TO_V2_ANCHOR: Record<IntroV3Anchor, IntroLayerAnchor> = {
  "top-left": "top_left",
  "top-center": "top_center",
  "top-right": "top_right",
  "middle-left": "center_left",
  "middle-center": "center",
  "middle-right": "center_right",
  "bottom-left": "bottom_left",
  "bottom-center": "bottom_center",
  "bottom-right": "bottom_right",
};

export function transformIntroV3GeometryToRect(input: {
  geometry: IntroV3Geometry;
  viewport: IntroViewportSize;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}): IntroRenderRect {
  return transformLayerToRect({
    layer: {
      type: "IMAGE",
      anchor: V3_TO_V2_ANCHOR[input.geometry.anchor],
      xPct: input.geometry.xPct,
      yPct: input.geometry.yPct,
      widthPct: input.geometry.widthPct,
      heightPct: input.geometry.heightPct,
      safeArea: input.geometry.safeArea,
      aspectPolicy: input.geometry.fit === "COVER" ? "cover" : "contain",
    },
    viewport: input.viewport,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    mediaWidth: input.mediaWidth,
    mediaHeight: input.mediaHeight,
  });
}
