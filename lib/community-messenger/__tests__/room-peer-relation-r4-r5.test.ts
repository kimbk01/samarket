import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDirectRoomPeerRelation,
  patchRoomSnapshotPeerRelation,
  type DirectRoomPeerRelation,
} from "@/lib/community-messenger/room/direct-room-peer-relation-patch";
import { shouldHidePeerAddContactForInitiator } from "@/components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** 1단계 문서 §17-5 R-4·R-5 (Owner 2026-10-26 승인): 방 관계 값 다시 받기 · 거절·차단 상대 방 메뉴 친구 줄 숨김 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const PEER = "peer-1";

function snap(over: Partial<CommunityMessengerRoomSnapshot> = {}): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "me",
    room: { id: "room-1", roomType: "direct", peerUserId: PEER } as CommunityMessengerRoomSnapshot["room"],
    members: [
      { id: "me", blocked: false, isFriend: false },
      { id: PEER, blocked: false, isFriend: false },
    ] as CommunityMessengerRoomSnapshot["members"],
    messages: [{ id: "m1" }] as CommunityMessengerRoomSnapshot["messages"],
    myRole: "member",
    activeCall: null,
    peerFriendshipState: "none",
    friendshipDirection: "none",
    directMessageDenied: null,
    directCallGate: { canStartVoice: true, canStartVideo: true },
    ...over,
  } as CommunityMessengerRoomSnapshot;
}

const rejected: DirectRoomPeerRelation = {
  peerFriendshipState: "none",
  friendshipDirection: "none",
  pendingFriendshipRequestId: null,
  directMessageDenied: "rejected_by_peer",
  peerBlockedByMe: false,
  peerRelationLabel: "stranger",
};

describe("R-4 patchRoomSnapshotPeerRelation", () => {
  it("관계 값만 덮고 타임라인·통화 권한은 그대로", () => {
    const prev = snap();
    const next = patchRoomSnapshotPeerRelation(prev, PEER, rejected);
    expect(next.directMessageDenied).toBe("rejected_by_peer");
    expect(next.messages).toBe(prev.messages);
    expect(next.room).toBe(prev.room);
    expect(next.directCallGate).toBe(prev.directCallGate);
  });

  it("값이 같으면 같은 객체(다시 그리기 없음)", () => {
    const prev = snap({ directMessageDenied: "rejected_by_peer", peerRelationLabel: "stranger" });
    expect(patchRoomSnapshotPeerRelation(prev, PEER, rejected)).toBe(prev);
  });

  it("내가 차단·친구 여부를 상대 멤버에 반영, 해제 시 되돌림", () => {
    const blocked = patchRoomSnapshotPeerRelation(snap(), PEER, {
      ...rejected,
      directMessageDenied: "blocked",
      peerBlockedByMe: true,
    });
    expect(blocked.members.find((m) => m.id === PEER)?.blocked).toBe(true);
    const cleared = patchRoomSnapshotPeerRelation(blocked, PEER, { ...rejected, directMessageDenied: null });
    expect(cleared.members.find((m) => m.id === PEER)?.blocked).toBe(false);
    expect(cleared.directMessageDenied).toBeNull();
    const friend = patchRoomSnapshotPeerRelation(cleared, PEER, {
      ...rejected,
      peerFriendshipState: "accepted",
      friendshipDirection: "mutual_accepted",
      directMessageDenied: null,
    });
    expect(friend.members.find((m) => m.id === PEER)?.isFriend).toBe(true);
  });

  it("친구 삭제 후 수락 때 남은 표시값(mutual_friend)을 서버 값으로 — 방 바 다시 보임 (00:34 실기기)", () => {
    const prev = snap({ peerFriendshipState: "accepted", peerRelationLabel: "mutual_friend" });
    const next = patchRoomSnapshotPeerRelation(prev, PEER, rejected);
    expect(next.peerRelationLabel).toBe("stranger");
    expect(next.directCallGate).toBe(prev.directCallGate);
  });

  it("받은 요청 id 반영", () => {
    const next = patchRoomSnapshotPeerRelation(snap(), PEER, {
      ...rejected,
      peerFriendshipState: "pending",
      friendshipDirection: "incoming_pending",
      pendingFriendshipRequestId: "req-1",
      directMessageDenied: null,
    });
    expect(next.pendingFriendshipRequestId).toBe("req-1");
    expect(next.friendshipDirection).toBe("incoming_pending");
  });

  it("응답 파싱 — 모르는 값이면 null(지금 값 유지)", () => {
    expect(parseDirectRoomPeerRelation(rejected)).toEqual(rejected);
    expect(parseDirectRoomPeerRelation({ ...rejected, directMessageDenied: "x" })).toBeNull();
    expect(parseDirectRoomPeerRelation(null)).toBeNull();
  });
});

describe("R-4 경로 계약", () => {
  it("방 스냅샷과 API 가 같은 판정 함수, 통화 권한은 스냅샷에서 그대로", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain("resolveDirectRoomPeerRelation(sb as any, userId, peerUserId, friendshipResolved, {");
    /** R2-a: 관계 원천은 요청당 1회 — 관계 표시와 통화 권한이 같은 값을 쓴다 */
    expect(svc).toContain("relationPreload: {");
    expect(svc).toContain("savedByMe: friendshipResolved.state === \"accepted\"");
    expect(svc).toContain("friendshipPreload: friendshipPairResolutionFromResolved(friendshipResolved)");
    const route = read("app/api/community-messenger/rooms/[roomId]/peer-relation/route.ts");
    expect(route).toContain("resolveDirectRoomPeerRelation(sb as any, auth.userId, peerUserId, undefined, {");
    expect(route).toContain("withRelationLabel: true");
    expect(route).toContain('"private, no-store"');
    expect(read("lib/community-messenger/friendship/direct-room-peer-relation.ts")).not.toContain("canStartDirectCallBetweenUsers(");
  });

  it("방 진입·친구 요청 변경·친구 실시간 신호 때 다시 받음", () => {
    const hook = read("lib/community-messenger/room/use-messenger-room-friendship-sync.ts");
    expect(hook).toContain("/peer-relation");
    expect(hook).toContain("CM_FRIEND_REQUESTS_SYNCED_EVENT");
    expect(hook).toContain("syncPeerRelationRef.current?.();");
  });
});

describe("R-5 방 메뉴 친구 줄", () => {
  const base = { isGeneralFriendDirect: true, isInboundRecipient: false, isContactSaved: false };
  it("상대 거절·차단이면 숨김", () => {
    expect(shouldHidePeerAddContactForInitiator({ ...base, directMessageDenied: "rejected_by_peer" })).toBe(true);
    expect(shouldHidePeerAddContactForInitiator({ ...base, directMessageDenied: "blocked" })).toBe(true);
  });
  it("막힘 없으면 그대로 보임", () => {
    expect(shouldHidePeerAddContactForInitiator({ ...base, directMessageDenied: null })).toBe(false);
    expect(shouldHidePeerAddContactForInitiator(base)).toBe(false);
  });
});
