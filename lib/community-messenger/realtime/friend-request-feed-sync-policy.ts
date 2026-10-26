/**
 * 전역 친구 요청 피드 조회 정책 — 서버 부하 R1 (docs/audit/messenger-2026-10-26-server-load-root-cause.md §5).
 *
 * - 앱 복귀 한 번에 visibilitychange·focus·appStateChange 가 거의 동시에 와서 `friend-requests` 를 2번 조회했다
 *   (운영 10-26 03Z: 276회/h, 전날 84회/h). 복귀 신호는 짧은 창 안에서 1번으로 합친다.
 * - 조회 결과를 알릴 때마다 열린 방이 `peer-relation` 을 다시 받았다(같은 시간 261회/h). 목록이 실제로 바뀌었거나
 *   복귀·실시간 재연결(놓친 변경이 있을 수 있음)일 때만 방 관계 값을 다시 받게 한다.
 */
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

/** 복귀 신호 3종이 도착하는 간격보다 넉넉하게 — 실제 복귀 간격(수 초 이상)보다는 짧게 */
export const FRIEND_REQUEST_FEED_RESUME_COALESCE_MS = 2_000;

export type FriendRequestFeedSyncReason = "start" | "subscribed" | "reconnect" | "resume" | "realtime" | "request";

/** 방 관계 값을 목록 변경과 무관하게 다시 받아야 하는 조회 이유 — 끊긴 동안 놓친 변경이 있을 수 있다 */
export function friendRequestFeedReasonForcesRelationRecheck(reason: FriendRequestFeedSyncReason): boolean {
  return reason === "resume" || reason === "reconnect";
}

/** 요청 목록 비교용 지문 — 순서와 무관, 상태·방향 변경을 잡는다 */
export function friendRequestsSignature(requests: readonly CommunityMessengerFriendRequest[]): string {
  return requests
    .map((r) => `${r.id}:${r.status}:${r.direction}`)
    .sort()
    .join("|");
}

/** 같은 복귀에서 온 신호를 1번으로 합친다. 반환 true = 이번 신호로 조회한다 */
export function createResumeSignalCoalescer(windowMs: number = FRIEND_REQUEST_FEED_RESUME_COALESCE_MS) {
  let lastAcceptedAt = Number.NEGATIVE_INFINITY;
  return {
    accept(now: number): boolean {
      if (now - lastAcceptedAt < windowMs) return false;
      lastAcceptedAt = now;
      return true;
    },
    reset(): void {
      lastAcceptedAt = Number.NEGATIVE_INFINITY;
    },
  };
}

/**
 * 조회 결과를 알릴 때 방 관계 값 재조회 여부.
 * 첫 조회(이전 지문 없음)는 방 진입 조회가 이미 같은 값을 받으므로 바뀐 것으로 보지 않는다.
 */
export function friendRequestFeedRelationRecheck(args: {
  previousSignature: string | null;
  nextSignature: string;
  forced: boolean;
}): boolean {
  if (args.forced) return true;
  if (args.previousSignature == null) return false;
  return args.previousSignature !== args.nextSignature;
}
