import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";

/**
 * GET /api/posts/:id/comments — 초기·무음 갱신 겹침을 한 요청으로 합친다.
 * 헤더·본문 읽기를 한 마감으로 묶어 멈춘 요청이 댓글 키를 붙잡지 않게 하고, 파싱 결과만 공유한다.
 */
export function fetchPostCommunityCommentsShared(postId: string): Promise<unknown> {
  return runSingleFlight(`post:${postId}:comments-get`, () =>
    runWithSharedFlightDeadline("post_community_comments", ENTRY_SHARED_FLIGHT_DEADLINE_MS, async (signal) => {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, { cache: "no-store", signal });
      return res.json().catch(() => ({}));
    })
  );
}
