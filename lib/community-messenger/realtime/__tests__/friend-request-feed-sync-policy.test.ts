import { describe, expect, it } from "vitest";
import {
  createResumeSignalCoalescer,
  FRIEND_REQUEST_FEED_RESUME_COALESCE_MS,
  friendRequestFeedReasonForcesRelationRecheck,
  friendRequestFeedRelationRecheck,
  friendRequestsSignature,
} from "@/lib/community-messenger/realtime/friend-request-feed-sync-policy";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

function req(id: string, status: string, direction: "incoming" | "outgoing"): CommunityMessengerFriendRequest {
  return { id, status, direction } as unknown as CommunityMessengerFriendRequest;
}

describe("friend-request-feed-sync-policy (서버 부하 R1)", () => {
  it("한 번의 앱 복귀에 겹친 visibility·focus·appState 신호는 조회 1번", () => {
    const c = createResumeSignalCoalescer();
    expect(c.accept(1_000)).toBe(true);
    expect(c.accept(1_005)).toBe(false);
    expect(c.accept(1_040)).toBe(false);
  });

  it("다음 복귀(창 밖)는 다시 조회", () => {
    const c = createResumeSignalCoalescer();
    expect(c.accept(1_000)).toBe(true);
    expect(c.accept(1_000 + FRIEND_REQUEST_FEED_RESUME_COALESCE_MS)).toBe(true);
  });

  it("계정 전환(reset) 뒤 첫 복귀는 바로 조회", () => {
    const c = createResumeSignalCoalescer();
    expect(c.accept(1_000)).toBe(true);
    c.reset();
    expect(c.accept(1_001)).toBe(true);
  });

  it("지문은 순서와 무관하고 상태·방향 변경을 잡는다", () => {
    const a = [req("1", "pending", "incoming"), req("2", "pending", "outgoing")];
    const b = [req("2", "pending", "outgoing"), req("1", "pending", "incoming")];
    expect(friendRequestsSignature(a)).toBe(friendRequestsSignature(b));
    expect(friendRequestsSignature(a)).not.toBe(friendRequestsSignature([req("1", "accepted", "incoming"), a[1]]));
    expect(friendRequestsSignature(a)).not.toBe(friendRequestsSignature([a[0]]));
  });

  it("복귀·재연결만 목록 변경과 무관하게 방 관계 값을 다시 받는다", () => {
    expect(friendRequestFeedReasonForcesRelationRecheck("resume")).toBe(true);
    expect(friendRequestFeedReasonForcesRelationRecheck("reconnect")).toBe(true);
    for (const r of ["start", "subscribed", "realtime", "request"] as const) {
      expect(friendRequestFeedReasonForcesRelationRecheck(r)).toBe(false);
    }
  });

  it("방 관계 값 재조회: 강제면 항상, 첫 조회는 아님, 이후는 목록이 바뀐 때만", () => {
    expect(friendRequestFeedRelationRecheck({ previousSignature: "x", nextSignature: "x", forced: true })).toBe(true);
    expect(friendRequestFeedRelationRecheck({ previousSignature: null, nextSignature: "x", forced: false })).toBe(false);
    expect(friendRequestFeedRelationRecheck({ previousSignature: "x", nextSignature: "x", forced: false })).toBe(false);
    expect(friendRequestFeedRelationRecheck({ previousSignature: "x", nextSignature: "y", forced: false })).toBe(true);
    expect(friendRequestFeedRelationRecheck({ previousSignature: "", nextSignature: "1:pending:incoming", forced: false })).toBe(
      true
    );
  });
});
