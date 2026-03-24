/**
 * 28단계: 노출 정책 라벨·옵션
 */

import type { ExposureSurface } from "@/lib/types/exposure";
import { SURFACE_LABELS } from "./exposure-score-utils";

export { SURFACE_LABELS };

export const SURFACE_OPTIONS: { value: ExposureSurface; label: string }[] = [
  { value: "home", label: "홈" },
  { value: "search", label: "검색" },
  { value: "shop_featured", label: "상점 featured" },
];
