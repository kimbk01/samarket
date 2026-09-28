/**
 * Admin Canvas fit — editor representation only.
 *
 * A. DOCUMENT = SCENE_NORMALIZED_PCT (persisted)
 * B. LOGICAL PREVIEW VIEWPORT = 9:16 (preview transform, not physical phone px)
 * C. ADMIN CSS CANVAS = fitted into available workspace (never persisted)
 *
 * Do not derive width from height alone.
 * Do not fill arbitrary browser height because space exists.
 */

export const INTRO_EDITOR_LOGICAL_W = 9;
export const INTRO_EDITOR_LOGICAL_H = 16;
export const INTRO_EDITOR_LOGICAL_ASPECT = INTRO_EDITOR_LOGICAL_W / INTRO_EDITOR_LOGICAL_H;

/**
 * Workspace constraint, not a CSS pixel height.
 * Canvas may use at most this fraction of available center width AND height.
 */
export const INTRO_EDITOR_CANVAS_FIT_OCCUPANCY = 0.7;

export type IntroEditorCanvasFitInput = {
  availableW: number;
  availableH: number;
  logicalW?: number;
  logicalH?: number;
  occupancy?: number;
};

export type IntroEditorCanvasFit = {
  logicalW: number;
  logicalH: number;
  logicalAspect: number;
  availableW: number;
  availableH: number;
  occupancy: number;
  scale: number;
  renderedW: number;
  renderedH: number;
  overflow: false;
};

export function fitIntroEditorCanvas(input: IntroEditorCanvasFitInput): IntroEditorCanvasFit {
  const logicalW = input.logicalW ?? INTRO_EDITOR_LOGICAL_W;
  const logicalH = input.logicalH ?? INTRO_EDITOR_LOGICAL_H;
  const occupancy = input.occupancy ?? INTRO_EDITOR_CANVAS_FIT_OCCUPANCY;
  const availableW = Math.max(1, input.availableW);
  const availableH = Math.max(1, input.availableH);
  const logicalAspect = logicalW / logicalH;
  const boundW = availableW * occupancy;
  const boundH = availableH * occupancy;
  const scale = Math.min(boundW / logicalW, boundH / logicalH);
  const renderedW = logicalW * scale;
  const renderedH = logicalH * scale;
  return {
    logicalW,
    logicalH,
    logicalAspect,
    availableW,
    availableH,
    occupancy,
    scale,
    renderedW,
    renderedH,
    overflow: false,
  };
}
