import type { PublicReviewType } from "@/lib/types/daangn";

/** 1차 단순 가중 — 추후 배치 재계산 가능 */
export function computeReviewDelta(
  publicType: PublicReviewType,
  positiveCount: number,
  negativeCount: number
): number {
  let d = 0;
  if (publicType === "good") d += 0.35;
  else if (publicType === "normal") d += 0.08;
  else d -= 0.45;
  d += Math.min(positiveCount, 5) * 0.12;
  d -= Math.min(negativeCount, 5) * 0.22;
  return Math.round(d * 100) / 100;
}
