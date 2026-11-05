"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";

/**
 * 현재 사용자의 해당 게시글 찜 여부 — API 라우트 사용 (RLS 401 회피)
 * 상세·버튼 등 동일 글에서 동시에 불릴 때 한 요청으로 합침.
 */
export async function getFavoriteStatus(postId: string): Promise<boolean> {
  const user = getCurrentUser();
  const pid = postId?.trim() ?? "";
  if (!user?.id || !pid) return false;

  try {
    const params = new URLSearchParams({ postIds: pid });
    const data = await runSingleFlight(`favorites:status:single:${pid}`, () =>
      runWithSharedFlightDeadline("favorite_status_single", ENTRY_SHARED_FLIGHT_DEADLINE_MS, async (signal) => {
        const res = await fetch(`/api/favorites/status?${params}`, {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        return (await res.json().catch(() => ({}))) as Record<string, boolean>;
      })
    );
    return data[pid] === true;
  } catch {
    return false;
  }
}
