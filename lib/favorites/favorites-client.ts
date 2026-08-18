/** 클라이언트 찜 API — `/api/favorites/*` */

import { runSingleFlight } from "@/lib/http/run-single-flight";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";

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

/** SEARCH/LIST/DETAIL writer SSOT is `toggleFavorite`. Keep this alias so leftover callers share events. */
export async function toggleFavoritePost(
  postId: string
): Promise<{ ok: boolean; isFavorite?: boolean; favoriteCount?: number; error?: string }> {
  return toggleFavorite(postId);
}
