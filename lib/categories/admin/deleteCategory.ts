"use client";

/**
 * 카테고리 삭제 — 서버 API (/api/admin/trade/categories).
 * 글이나 하위 카테고리가 있으면 서버가 409 로 막는다 (확인과 삭제가 같은 서버 요청 · FK 로 이중 보호).
 */
import { postCategoryAdminOp } from "@/lib/categories/admin/category-admin-api";

export type DeleteCategoryResult = { ok: true } | { ok: false; error: string };

export async function deleteCategory(id: string): Promise<DeleteCategoryResult> {
  const res = await postCategoryAdminOp({ op: "delete", id });
  return res.ok ? { ok: true } : res;
}
