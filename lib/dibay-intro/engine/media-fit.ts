import type { MediaFit, NormalizedFrame } from "@/lib/dibay-intro/document";
import { containRect, coverRect } from "@/lib/dibay-intro/geometry";

export function fittedMediaRect(
  sourceW: number,
  sourceH: number,
  box: NormalizedFrame,
  fit: MediaFit,
): NormalizedFrame {
  return fit === "cover" ? coverRect(sourceW, sourceH, box) : containRect(sourceW, sourceH, box);
}

export function frameToCss(frame: NormalizedFrame): { left: string; top: string; width: string; height: string } {
  return {
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.width * 100}%`,
    height: `${frame.height * 100}%`,
  };
}
