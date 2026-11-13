import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D15 (docs/design/group-chat-d15-d16-design-2026-11-13.md §1):
 * 방·참여자는 저장됐는데 만든 사람 방 요약 조회만 실패하면 — 실패로 돌려주면 화면이 오류를 띄우고 다시 눌러 같은 방이 또 생긴다.
 * 실제 `createGroupRoom` 을 돌려(저장소·알림·발행만 대체) 「성공 + room:null + roomId」 와 초대받은 사람 목록 INSERT 발행을 확인한다.
 */
const h = vi.hoisted(() => ({
  summary: null as null | { id: string },
  inviteePublish: [] as Array<{ fromUserId: string; roomId: string; inviteeUserIds: string[] }>,
  deleted: [] as string[],
}));

vi.mock("@/lib/community-messenger/group/group-room-repository", () => ({
  resolveGroupRoomSupabase: () => ({}),
  dedupeGroupMemberIds: (ids: string[]) => [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))],
  profileIdsExist: async () => true,
  fetchProfileLabels: async () => new Map([["peer-1", "피어"]]),
  insertPrivateGroupRoom: async () => ({ ok: true, roomId: "room-new" }),
  insertGroupParticipants: async () => ({ ok: true }),
  deletePrivateGroupRoom: async (_sb: unknown, roomId: string) => {
    h.deleted.push(roomId);
  },
  insertGroupSystemMessage: async () => ({ ok: true }),
  countActiveParticipants: async () => 2,
  fetchActiveParticipant: async () => null,
  fetchPrivateGroupRoom: async () => null,
  listMyPrivateGroupRooms: async () => [],
  markParticipantLeft: async () => ({ ok: true }),
  patchGroupRoomSettings: async () => ({ ok: true }),
  upsertGroupMemberParticipants: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({
  isBlockedEitherWayActive: async () => false,
}));
vi.mock("@/lib/community-messenger/friendship-resolver", () => ({
  isAcceptedFriendPair: async () => true,
}));
vi.mock("@/lib/community-messenger/group/group-room-ban-service", () => ({
  isUserBannedFromGroup: async () => false,
}));
vi.mock("@/lib/community-messenger/group/group-room-realtime", () => ({
  publishGroupRoomListBump: async () => undefined,
}));
vi.mock("@/lib/notifications/community-messenger-group-inapp-notify", () => ({
  notifyCommunityMessengerGroupInviteReceived: async () => undefined,
}));
vi.mock("@/lib/community-messenger/realtime/home-list-room-insert-broadcast-server", () => ({
  publishHomeListRoomInsertForInviteesBestEffort: async (args: {
    fromUserId: string;
    roomId: string;
    inviteeUserIds: string[];
  }) => {
    h.inviteePublish.push(args);
  },
}));
vi.mock("@/lib/community-messenger/service", () => ({
  getCommunityMessengerSingleRoomSummaryForViewer: async () => h.summary,
}));

import { createGroupRoom } from "@/lib/community-messenger/group/group-room-service";

describe("D15 그룹 생성 일부 성공", () => {
  beforeEach(() => {
    h.summary = null;
    h.inviteePublish = [];
    h.deleted = [];
  });

  it("요약 조회만 실패: 성공 + room:null + roomId, 방은 지우지 않고 초대받은 사람 목록 INSERT 발행", async () => {
    const out = await createGroupRoom({ userId: "me-1", title: "모임", memberIds: ["peer-1"] });
    expect(out).toEqual({ ok: true, roomId: "room-new", room: null });
    expect(h.deleted).toEqual([]);
    expect(h.inviteePublish).toEqual([{ fromUserId: "me-1", roomId: "room-new", inviteeUserIds: ["peer-1"] }]);
  });

  it("요약 있음: 지금처럼 요약을 돌려주고 초대 INSERT 발행 1회", async () => {
    h.summary = { id: "room-new" };
    const out = await createGroupRoom({ userId: "me-1", title: "모임", memberIds: ["peer-1"] });
    expect(out).toEqual({ ok: true, roomId: "room-new", room: { id: "room-new" } });
    expect(h.inviteePublish).toHaveLength(1);
  });
});
