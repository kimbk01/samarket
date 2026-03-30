"use client";

export interface FavoriteAuditRow {
  id: string;
  user_id: string;
  post_id: string;
  action: "add" | "remove";
  created_at: string;
}

/**
 * 비정상 찜 감지용: 최근 찜 추가/삭제 로그 (관리자)
 * — `/api/admin/favorite-audit` (세션 + 관리자 검증 + service role)로 조회해 RLS와 무관하게 동일 DB를 본다.
 */
export async function getFavoriteAuditLog(limit = 200): Promise<FavoriteAuditRow[]> {
  try {
    const res = await fetch(`/api/admin/favorite-audit?limit=${limit}`, {
      credentials: "include",
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: FavoriteAuditRow[] };
    if (!res.ok || !Array.isArray(d.items)) return [];
    return d.items;
  } catch {
    return [];
  }
}
