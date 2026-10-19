"use client";

/**
 * 카테고리 설정 저장 — 서버 API (/api/admin/trade/categories, 반영 확인·감사)
 * - category_id 기준으로 있으면 update, 없으면 insert (서버에서 기본값과 합침)
 */
import type { CategorySettingsUpdatePayload } from "./types";
import { postCategoryAdminOp } from "@/lib/categories/admin/category-admin-api";

export type UpsertCategorySettingsResult = { ok: true } | { ok: false; error: string };

export async function upsertCategorySettings(
  categoryId: string,
  payload: CategorySettingsUpdatePayload
): Promise<UpsertCategorySettingsResult> {
  const res = await postCategoryAdminOp({ op: "update", id: categoryId, settings: payload });
  return res.ok ? { ok: true } : res;
}
