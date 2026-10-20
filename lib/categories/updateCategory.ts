"use client";

/**
 * 카테고리 단건 수정 — 서버 API (/api/admin/trade/categories, 반영 확인·감사)
 */
import type { CategoryUpdatePayload } from "./types";
import { postCategoryAdminOp } from "@/lib/categories/admin/category-admin-api";

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

export async function updateCategory(
  id: string,
  payload: CategoryUpdatePayload
): Promise<UpdateCategoryResult> {
  const res = await postCategoryAdminOp({ op: "update", id, category: payload });
  return res.ok ? { ok: true } : res;
}
