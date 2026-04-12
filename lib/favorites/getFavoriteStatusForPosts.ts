"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/**
 * 여러 게시글에 대한 현재 사용자 찜 여부 (목록용) — API 라우트 사용 (RLS 401 회피)
 */
export async function getFavoriteStatusForPosts(
  postIds: string[]
): Promise<Record<string, boolean>> {
  const user = getCurrentUser();
  const ids = [...new Set(postIds)].filter(Boolean).sort();
  const empty = Object.fromEntries(ids.map((id) => [id, false]));

  if (!user?.id || ids.length === 0) return empty;

  const flightKey = `favorites:status:${ids.join(",")}`;
  return runSingleFlight(flightKey, async () => {
    try {
      const params = new URLSearchParams({
        postIds: ids.join(","),
      });
      const res = await fetch(`/api/favorites/status?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, boolean>;
      return Object.fromEntries(ids.map((id) => [id, data[id] === true]));
    } catch {
      return empty;
    }
  });
}
