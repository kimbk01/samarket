"use client";

/**
 * 현재 사용자의 찜(관심) 상품 개수 — 서버 API (service role)
 */
export async function getMyFavoriteCount(): Promise<number> {
  try {
    const res = await fetch("/api/favorites/count");
    const data = (await res.json()) as { count?: number };
    return typeof data.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}
