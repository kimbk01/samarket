"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { updateCategory, type UpdateCategoryResult } from "@/lib/categories/updateCategory";

/** 두 카테고리의 sort_order만 교환 (목록 일부만 재정렬할 때 사용) */
export async function swapCategorySortOrders(
  a: CategoryWithSettings,
  b: CategoryWithSettings
): Promise<UpdateCategoryResult> {
  const a0 = a.sort_order;
  const b0 = b.sort_order;
  const r1 = await updateCategory(a.id, { sort_order: b0 });
  if (!r1.ok) return r1;
  return updateCategory(b.id, { sort_order: a0 });
}
