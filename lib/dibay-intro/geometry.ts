import type { NormalizedFrame } from "@/lib/dibay-intro/document";

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function clampFrame(frame: NormalizedFrame): NormalizedFrame {
  const width = clamp01(frame.width);
  const height = clamp01(frame.height);
  const x = clamp01(Math.min(frame.x, 1 - width));
  const y = clamp01(Math.min(frame.y, 1 - height));
  return { x, y, width, height };
}

export function containRect(
  sourceW: number,
  sourceH: number,
  box: NormalizedFrame,
): NormalizedFrame {
  if (sourceW <= 0 || sourceH <= 0) return box;
  const source = sourceW / sourceH;
  const dest = box.width / box.height;
  if (source > dest) {
    const height = box.width / source;
    return { x: box.x, y: box.y + (box.height - height) / 2, width: box.width, height };
  }
  const width = box.height * source;
  return { x: box.x + (box.width - width) / 2, y: box.y, width, height: box.height };
}

export function coverRect(
  sourceW: number,
  sourceH: number,
  box: NormalizedFrame,
): NormalizedFrame {
  if (sourceW <= 0 || sourceH <= 0) return box;
  const source = sourceW / sourceH;
  const dest = box.width / box.height;
  if (source > dest) {
    const width = box.height * source;
    return { x: box.x - (width - box.width) / 2, y: box.y, width, height: box.height };
  }
  const height = box.width / source;
  return { x: box.x, y: box.y - (height - box.height) / 2, width: box.width, height };
}
