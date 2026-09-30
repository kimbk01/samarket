/**
 * REBUILD 14 P6 — Admin geometry helpers for insert / replace / center.
 *
 * Scene CRUD reuses P4 `intro/document-ops` (ONE scene authority).
 * Do not duplicate rename/duplicate/reorder/delete here.
 */

import {
  applyExplicitCenter,
  fitIntrinsicIntoMaxBox,
  type NormalizedFrame,
} from "@/lib/startup-compositor/execution/geometry";
import type { MediaSize } from "@/lib/intro/geometry/element-layout";
import { DEFAULT_MOTION } from "@/lib/startup-compositor/registries/motion";

/** IMAGE/LOGO insert: intrinsic aspect, CONTAIN center. No 55×55 square. */
export function insertImageElementFrame(args: {
  readonly intrinsic: MediaSize | null | undefined;
  readonly maxW?: number;
  readonly maxH?: number;
}): NormalizedFrame {
  const maxW = args.maxW ?? 0.7;
  const maxH = args.maxH ?? 0.45;
  const fitted = fitIntrinsicIntoMaxBox({
    intrinsic: args.intrinsic,
    maxW,
    maxH,
    mode: "CONTAIN",
  });
  return applyExplicitCenter(fitted);
}

/** Replace media: preserve elementId/geometry/motion/timing/z; change mediaRef only. */
export function replaceElementMediaId<T extends { mediaId: string }>(
  payload: T,
  mediaId: string,
): T {
  return { ...payload, mediaId };
}

/** Center uses P5 canonical geometry. */
export function centerElementFrame(frame: NormalizedFrame): NormalizedFrame {
  return applyExplicitCenter(frame);
}

export { DEFAULT_MOTION };

/** Re-export P4 scene ops as Admin scene authority (no second implementation). */
export {
  createScene as addScene,
  renameScene,
  duplicateScene,
  reorderScenes,
  deleteScene,
  type SceneOpsResult,
} from "@/lib/startup-compositor/intro/document-ops";
