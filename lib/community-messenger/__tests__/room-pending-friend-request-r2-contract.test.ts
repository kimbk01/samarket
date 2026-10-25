import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 1단계 문서 §17-2 R-2 (Owner 2026-10-25 승인): 방 상단 바 받은·보낸 친구 요청 — 방 스냅샷에만 대기 요청 반영 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("room pending friend request (R-2)", () => {
  it("서버: 판정 함수는 그대로, 방 스냅샷에만 대기 요청 반영", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain("fetchPendingFriendRequestBetween(sb as any, userId, peerUserId)");
    expect(svc).toMatch(/peerFriendshipState = "pending";\s*friendshipDirection = pending\.direction;\s*pendingFriendshipRequestId = pending\.id;/);
    const resolver = read("lib/community-messenger/friendship/resolve-friendship-pair.ts");
    expect(resolver).not.toContain("community_friend_requests");
    const rel = read("lib/community-messenger/social-relations.ts");
    expect(rel).toContain('direction: trimText(row.requester_id) === viewer ? "outgoing_pending" : "incoming_pending"');
  });

  it("방 바: 받은 요청 수락·거절·차단, 보낸 요청 취소·차단", () => {
    const bar = read("components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar.tsx");
    expect(bar).toContain('variant === "incoming_request"');
    expect(bar).toContain('t("cm_friend_cta_accept")');
    expect(bar).toContain('t("cm_friend_cta_reject")');
    expect(bar).toContain('t("cm_friend_cta_cancel")');
    const notice = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx");
    expect(notice).toContain('vm.snapshot?.friendshipDirection === "incoming_pending"');
    expect(notice).toContain("/api/community-messenger/friend-requests/${encodeURIComponent(pendingRequestId)}");
    expect(notice).toContain('respondPendingRequest("cancel")');
  });
});
