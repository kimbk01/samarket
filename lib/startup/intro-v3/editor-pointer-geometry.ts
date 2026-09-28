/**
 * Pointer CSS px → SCENE_NORMALIZED_PCT.
 * Never persist CSS pixels.
 */

import {
  INTRO_EDITOR_LOGICAL_ASPECT,
  INTRO_EDITOR_LOGICAL_H,
  INTRO_EDITOR_LOGICAL_W,
} from "@/lib/startup/intro-v3/editor-canvas-fit";
import { normalizeIntroV3Geometry, type IntroV3Anchor, type IntroV3Geometry } from "@/lib/startup/intro-v3/geometry";

export const INTRO_EDITOR_MIN_SIZE_PCT = 4;

export type IntroEditorResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type IntroEditorBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function anchorX(anchor: IntroV3Anchor): number {
  return anchor.endsWith("left") ? 0 : anchor.endsWith("right") ? 1 : 0.5;
}

function anchorY(anchor: IntroV3Anchor): number {
  return anchor.startsWith("top") ? 0 : anchor.startsWith("bottom") ? 1 : 0.5;
}

function roundPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function clampSize(n: number): number {
  return Math.min(100, Math.max(INTRO_EDITOR_MIN_SIZE_PCT, roundPct(n)));
}

export function pointerDeltaToNormalizedPct(input: {
  pointerDeltaX: number;
  pointerDeltaY: number;
  renderedCanvasWidth: number;
  renderedCanvasHeight: number;
}): { deltaXPct: number; deltaYPct: number } {
  const w = input.renderedCanvasWidth;
  const h = input.renderedCanvasHeight;
  return {
    deltaXPct: w > 0 ? (input.pointerDeltaX / w) * 100 : 0,
    deltaYPct: h > 0 ? (input.pointerDeltaY / h) * 100 : 0,
  };
}

export function pointerPositionToNormalizedPct(input: {
  pointerX: number;
  pointerY: number;
  renderedCanvasWidth: number;
  renderedCanvasHeight: number;
}): { xPct: number; yPct: number } {
  const w = input.renderedCanvasWidth;
  const h = input.renderedCanvasHeight;
  return {
    xPct: w > 0 ? (input.pointerX / w) * 100 : 0,
    yPct: h > 0 ? (input.pointerY / h) * 100 : 0,
  };
}

export function introV3GeometryToBox(geometry: IntroV3Geometry): IntroEditorBox {
  return {
    left: geometry.xPct - geometry.widthPct * anchorX(geometry.anchor),
    top: geometry.yPct - geometry.heightPct * anchorY(geometry.anchor),
    width: geometry.widthPct,
    height: geometry.heightPct,
  };
}

export function introV3GeometryFromBox(input: {
  box: IntroEditorBox;
  anchor: IntroV3Anchor;
  fit: IntroV3Geometry["fit"];
  safeArea: boolean;
}): IntroV3Geometry {
  const width = clampSize(input.box.width);
  const height = clampSize(input.box.height);
  const maxLeft = Math.max(0, 100 - width);
  const maxTop = Math.max(0, 100 - height);
  const left = Math.min(maxLeft, Math.max(0, roundPct(input.box.left)));
  const top = Math.min(maxTop, Math.max(0, roundPct(input.box.top)));
  const next = normalizeIntroV3Geometry({
    xPct: left + width * anchorX(input.anchor),
    yPct: top + height * anchorY(input.anchor),
    widthPct: width,
    heightPct: height,
    anchor: input.anchor,
    fit: input.fit,
    safeArea: input.safeArea,
  });
  if (!next) {
    return {
      xPct: 50,
      yPct: 50,
      widthPct: width,
      heightPct: height,
      anchor: input.anchor,
      fit: input.fit,
      safeArea: input.safeArea,
    };
  }
  return next;
}

export function dragIntroV3Geometry(input: {
  start: IntroV3Geometry;
  deltaXPct: number;
  deltaYPct: number;
}): IntroV3Geometry {
  const box = introV3GeometryToBox(input.start);
  return introV3GeometryFromBox({
    box: {
      left: box.left + input.deltaXPct,
      top: box.top + input.deltaYPct,
      width: box.width,
      height: box.height,
    },
    anchor: input.start.anchor,
    fit: input.start.fit,
    safeArea: input.start.safeArea,
  });
}

function heightPctFromWidth(widthPct: number, mediaAspect: number, sceneAspect: number): number {
  if (!(mediaAspect > 0) || !(sceneAspect > 0)) return widthPct;
  return widthPct * (sceneAspect / mediaAspect);
}

function widthPctFromHeight(heightPct: number, mediaAspect: number, sceneAspect: number): number {
  if (!(mediaAspect > 0) || !(sceneAspect > 0)) return heightPct;
  return heightPct * (mediaAspect / sceneAspect);
}

function applyAspectLock(input: {
  width: number;
  height: number;
  mediaAspect: number | null;
  sceneAspect: number;
  driving: "width" | "height" | "both";
}): { width: number; height: number } {
  if (!(input.mediaAspect && input.mediaAspect > 0)) {
    return { width: input.width, height: input.height };
  }
  if (input.driving === "width") {
    return { width: input.width, height: heightPctFromWidth(input.width, input.mediaAspect, input.sceneAspect) };
  }
  if (input.driving === "height") {
    return { width: widthPctFromHeight(input.height, input.mediaAspect, input.sceneAspect), height: input.height };
  }
  const target = input.mediaAspect / input.sceneAspect;
  if (input.height <= 0) {
    return { width: input.width, height: heightPctFromWidth(input.width, input.mediaAspect, input.sceneAspect) };
  }
  if (input.width / input.height > target) {
    return { width: input.width, height: input.width / target };
  }
  return { width: input.height * target, height: input.height };
}

export function resizeIntroV3Geometry(input: {
  start: IntroV3Geometry;
  handle: IntroEditorResizeHandle;
  pointerXPct: number;
  pointerYPct: number;
  aspectLocked: boolean;
  mediaAspect: number | null;
  sceneAspect?: number;
}): IntroV3Geometry {
  const sceneAspect = input.sceneAspect ?? INTRO_EDITOR_LOGICAL_ASPECT;
  const start = introV3GeometryToBox(input.start);
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  let left = start.left;
  let top = start.top;
  let nextRight = right;
  let nextBottom = bottom;
  const handle = input.handle;

  if (handle.includes("w")) left = input.pointerXPct;
  if (handle.includes("e")) nextRight = input.pointerXPct;
  if (handle.includes("n")) top = input.pointerYPct;
  if (handle.includes("s")) nextBottom = input.pointerYPct;

  let width = nextRight - left;
  let height = nextBottom - top;
  if (width < 0) {
    left = nextRight;
    width = Math.abs(width);
  }
  if (height < 0) {
    top = nextBottom;
    height = Math.abs(height);
  }

  if (input.aspectLocked && input.mediaAspect && input.mediaAspect > 0) {
    const driving: "width" | "height" | "both" =
      handle === "e" || handle === "w" ? "width" : handle === "n" || handle === "s" ? "height" : "both";
    const locked = applyAspectLock({
      width,
      height,
      mediaAspect: input.mediaAspect,
      sceneAspect,
      driving,
    });
    if (handle.includes("w")) left = nextRight - locked.width;
    if (handle.includes("n")) top = nextBottom - locked.height;
    if (!handle.includes("w") && !handle.includes("e")) {
      left = start.left + (start.width - locked.width) / 2;
    }
    if (!handle.includes("n") && !handle.includes("s")) {
      top = start.top + (start.height - locked.height) / 2;
    }
    width = locked.width;
    height = locked.height;
  }

  return introV3GeometryFromBox({
    box: { left, top, width, height },
    anchor: input.start.anchor,
    fit: input.start.fit,
    safeArea: input.start.safeArea,
  });
}

export function editorFrameRect(input: {
  geometry: IntroV3Geometry;
  renderedW: number;
  renderedH: number;
}): { x: number; y: number; width: number; height: number } {
  const box = introV3GeometryToBox(input.geometry);
  return {
    x: (box.left / 100) * input.renderedW,
    y: (box.top / 100) * input.renderedH,
    width: (box.width / 100) * input.renderedW,
    height: (box.height / 100) * input.renderedH,
  };
}

/** Kept for tests / docs: 9×16 logical surface used when converting aspect lock. */
export const INTRO_EDITOR_SCENE_SURFACE = {
  width: INTRO_EDITOR_LOGICAL_W,
  height: INTRO_EDITOR_LOGICAL_H,
  aspect: INTRO_EDITOR_LOGICAL_ASPECT,
} as const;
