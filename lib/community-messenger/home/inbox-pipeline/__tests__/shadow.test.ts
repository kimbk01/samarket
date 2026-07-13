import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLegacyMessengerHomeProjectionSnapshot,
  createMessengerHomeShadowDispatch,
} from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(id: string, extra: Partial<CommunityMessengerRoomSummary> = {}): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: id,
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "hi",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: true,
    contextMeta: null,
    ...extra,
  };
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: {
      id: "viewer",
      label: "viewer",
      avatarUrl: null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
    },
    tabs: { friends: 0, chats: chats.length, groups: 0, calls: 0 },
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [],
    chats,
    groups: [],
    discoverableGroups: [],
    calls: [],
  };
}

describe("messenger home shadow pipeline", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  it("receives critical/full-style room summary events without changing legacy data", () => {
    const shadow = createMessengerHomeShadowDispatch();
    const legacy = bootstrap([room("r1", { contextMeta: { v: 1, kind: "trade", productChatId: "pc" } })]);
    shadow.dispatchRoomSummaries("full", 1, legacy.chats);
    expect(shadow.peekState().rooms.get("r1")?.contextMeta?.kind).toBe("trade");
    expect(legacy.chats[0]?.contextMeta?.kind).toBe("trade");
  });

  it("applies remove events explicitly", () => {
    const shadow = createMessengerHomeShadowDispatch();
    shadow.dispatchRoomSummary("full", 1, room("r1"));
    shadow.dispatchRemove("multi_tab", 1, "r1", "leave");
    expect(shadow.peekState().rooms.has("r1")).toBe(false);
  });

  it("builds legacy projection snapshots for diff input", () => {
    const snap = buildLegacyMessengerHomeProjectionSnapshot(
      bootstrap([
        room("trade", { contextMeta: { v: 1, kind: "trade", productChatId: "pc" } }),
        room("direct", { messengerDirectKey: "a:b" }),
      ])
    );
    expect(snap.tradeRoomIds).toEqual(["trade"]);
    expect(snap.inboxRoomIds).toContain("direct");
  });

  it("returns runtime snapshot with legacy/canonical counts", () => {
    const shadow = createMessengerHomeShadowDispatch();
    const legacy = bootstrap([
      room("trade", { contextMeta: { v: 1, kind: "trade", productChatId: "pc" } }),
      room("direct", { messengerDirectKey: "a:b" }),
    ]);
    shadow.dispatchRoomSummaries("full", 1, legacy.chats);
    const snap = shadow.getRuntimeSnapshot(legacy, "viewer");
    expect(snap?.legacy.tradeCount).toBe(1);
    expect(snap?.canonical.tradeCount).toBe(1);
    expect(snap?.legacy.inboxCount).toBe(1);
    expect(snap?.performance.reducerEventCount).toBeGreaterThan(0);
  });

  it("dedupes identical diff logs by fingerprint", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const shadow = createMessengerHomeShadowDispatch();
    const legacy = bootstrap([room("r1", { messengerDirectKey: "a:b" })]);
    shadow.dispatchPatch("trade_meta", 1, {
      roomId: "r1",
      roomType: "direct",
      directKey: "a:b",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc" },
      title: "r1",
      avatarUrl: null,
      latestMessage: "hi",
      lastMessageAt: "2026-07-13T00:00:00.000Z",
      unreadCount: 0,
      isArchived: false,
      isBlockedHidden: false,
      roomStatus: "active",
      memberCount: 2,
    });
    shadow.compareLegacy(legacy, "viewer");
    shadow.compareLegacy(legacy, "viewer");
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });
});
