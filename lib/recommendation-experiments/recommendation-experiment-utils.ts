/**
 * 32단계: 실험·버전 유틸 (라벨 등)
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";

export const SURFACE_LABELS: Record<RecommendationSurface, string> = {
  home: "홈",
  search: "검색",
  shop: "상점",
};

export const ASSIGNED_GROUP_LABELS: Record<
  "control" | "variant_a" | "variant_b",
  string
> = {
  control: "대조군",
  variant_a: "실험군 A",
  variant_b: "실험군 B",
};
