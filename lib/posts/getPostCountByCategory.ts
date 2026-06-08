"use client";

export type GetPostCountByCategoryResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * 해당 카테고리 하위 게시물 수 (어드민 삭제 가능 여부 판단용)
 * - `GET /api/admin/categories/[categoryId]/post-count` (service_role)
 * - 실패 시 0으로 뭉개지 않음 — fail-closed
 */
export async function getPostCountByCategory(categoryId: string): Promise<GetPostCountByCategoryResult> {
  const id = categoryId?.trim();
  if (!id) {
    return { ok: false, error: "categoryId 필요" };
  }

  try {
    const res = await fetch(`/api/admin/categories/${encodeURIComponent(id)}/post-count`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number; error?: string };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "게시물 수를 확인할 수 없습니다.",
      };
    }
    return { ok: true, count: typeof data.count === "number" ? data.count : 0 };
  } catch {
    return { ok: false, error: "게시물 수를 확인할 수 없습니다." };
  }
}
