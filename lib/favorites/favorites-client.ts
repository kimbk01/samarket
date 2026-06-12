/** 클라이언트 찜 API — `/api/favorites/*` */

import { runSingleFlight } from "@/lib/http/run-single-flight";

const FAVORITES_LIST_FLIGHT = "favorites:list";

export async function fetchFavoritePostIds(userId?: string): Promise<string[]> {
  const uid = userId?.trim() ?? "";
  const flightKey = uid ? `${FAVORITES_LIST_FLIGHT}:${uid}` : FAVORITES_LIST_FLIGHT;
  try {
    return await runSingleFlight(flightKey, async () => {
      const res = await fetch("/api/favorites/list");
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: Array<{ id?: string }> };
      return (data.items ?? [])
        .map((item) => (typeof item.id === "string" ? item.id.trim() : ""))
        .filter(Boolean);
    });
  } catch {
    return [];
  }
}

export async function toggleFavoritePost(
  postId: string
): Promise<{ ok: boolean; isFavorite?: boolean; error?: string }> {
  const id = postId.trim();
  if (!id) return { ok: false, error: "postId 필요" };
  try {
    const res = await fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      isFavorite?: boolean;
      error?: string;
    };
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error ?? "처리에 실패했습니다." };
    }
    return { ok: true, isFavorite: data.isFavorite === true };
  } catch {
    return { ok: false, error: "네트워크 오류" };
  }
}
