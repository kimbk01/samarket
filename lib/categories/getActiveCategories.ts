"use client";

/**
 * 활성 카테고리만 조회 (is_active=true, sort_order asc)
 * 홈/전체서비스 등 프론트 렌더링용
 */
import { getCategories } from "./getCategories";
import type { CategoryWithSettings } from "./types";

export async function getActiveCategories(filters?: {
  type?: "trade" | "service" | "community" | "feature";
}): Promise<CategoryWithSettings[]> {
  return getCategories({ ...filters, activeOnly: true });
}
