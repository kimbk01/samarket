"use client";

/**
 * 카테고리 순서 변경 (orderedIds 순서대로 sort_order 0,1,2,... 부여) — 서버 API
 */
import { postCategoryAdminOp } from "@/lib/categories/admin/category-admin-api";

export type ReorderCategoriesResult = { ok: true } | { ok: false; error: string };

export async function reorderCategories(orderedIds: string[]): Promise<ReorderCategoriesResult> {
  const res = await postCategoryAdminOp({ op: "reorder", orderedIds });
  return res.ok ? { ok: true } : res;
}
