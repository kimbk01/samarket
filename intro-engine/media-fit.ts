import type { IntroShowMediaFit } from "./document";

export type Size = { width: number; height: number };

export type FittedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * ONE contain/cover implementation. LayerRenderer must use this — not CSS object-fit
 * as a second interpreter, and never Native.
 */
export function computeFittedRect(box: Size, media: Size, fit: IntroShowMediaFit): FittedRect {
  const boxW = Math.max(0, box.width);
  const boxH = Math.max(0, box.height);
  const mediaW = Math.max(1e-6, media.width);
  const mediaH = Math.max(1e-6, media.height);
  if (boxW <= 0 || boxH <= 0) return { x: 0, y: 0, width: 0, height: 0 };

  const boxRatio = boxW / boxH;
  const mediaRatio = mediaW / mediaH;
  let width: number;
  let height: number;

  if (fit === "contain") {
    if (mediaRatio > boxRatio) {
      width = boxW;
      height = boxW / mediaRatio;
    } else {
      height = boxH;
      width = boxH * mediaRatio;
    }
  } else if (mediaRatio > boxRatio) {
    height = boxH;
    width = boxH * mediaRatio;
  } else {
    width = boxW;
    height = boxW / mediaRatio;
  }

  return {
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
    width,
    height,
  };
}
