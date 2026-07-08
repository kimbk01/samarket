import { beforeEach, describe, expect, it } from "vitest";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import {
  beginLiteClientMergeGate,
  deferHomeSyncPatchDuringLiteMerge,
  endLiteClientMergeGate,
  homeSyncPayloadHasUnreadIncreaseAgainstBase,
  homeSyncPayloadNeedsReactUnreadSync,
  registerDeferredHomeSyncRunner,
  resetLiteMergeGateStateForTests,
  shouldSkipHomeSyncPayload,
} from "@/lib/community-messenger/home/lite-merge-gate";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

function room(id: string, unread = 0): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    title: id,
    avatarUrl: null,
    peerUserId: null,
    memberCount: 2,
    lastMessage: "hi",
    lastMessageType: "text",
    lastMessageAt: "2026-05-16T10:00:00.000Z",
    unreadCount: unread,
    isPinned: false,
    isMuted: false,
    isArchivedByViewer: false,
    contextMeta: null,
  } as CommunityMessengerRoomSummary;
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: {
      id: "u1",
      label: "me",
      subtitle: "",
      bio: null,
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

describe("lite-merge-gate", () => {
  beforeEach(() => {
    resetLiteMergeGateStateForTests();
    primeBootstrapCache(bootstrap([room("a", 0)]));
  });

  it("detects critical_patch unread increase against bootstrap cache", () => {
    const base = bootstrap([room("a", 0)]);
    expect(
      homeSyncPayloadHasUnreadIncreaseAgainstBase(
        { chats: [room("a", 5)], roomMode: "critical_patch" },
        base
      )
    ).toBe(true);
    expect(
      homeSyncPayloadHasUnreadIncreaseAgainstBase(
        { chats: [room("a", 0)], roomMode: "critical_patch" },
        base
      )
    ).toBe(false);
  });

  it("does not identical-skip replace payload with unread increase", () => {
    primeBootstrapCache(bootstrap([room("a", 0)]));
    const fresh = {
      chats: [room("a", 5)],
      roomMode: "replace" as const,
    };
    expect(shouldSkipHomeSyncPayload(fresh)).toBe(false);
  });

  it("does not identical-skip critical_patch payload with unread increase", () => {
    primeBootstrapCache(bootstrap([room("a", 0)]));
    const fresh = {
      chats: [room("a", 5)],
      roomMode: "critical_patch" as const,
    };
    expect(shouldSkipHomeSyncPayload(fresh)).toBe(false);
  });

  it("defer flush keeps the highest unreadCount when stale 0 precedes fresh 5", () => {
    const applied: unknown[] = [];
    registerDeferredHomeSyncRunner((payload) => {
      applied.push(payload);
    });

    beginLiteClientMergeGate();
    deferHomeSyncPatchDuringLiteMerge({
      chats: [room("a", 0)],
      roomMode: "critical_patch",
    });
    deferHomeSyncPatchDuringLiteMerge({
      chats: [room("a", 5)],
      roomMode: "critical_patch",
    });
    endLiteClientMergeGate();

    expect(applied).toHaveLength(1);
    const payload = applied[0] as { chats?: CommunityMessengerRoomSummary[] };
    expect(payload.chats?.[0]?.unreadCount).toBe(5);
  });

  it("still allows identical-skip for unchanged critical_patch payloads", () => {
    primeBootstrapCache(bootstrap([room("a", 0)]));
    const payload = {
      chats: [room("a", 0)],
      roomMode: "critical_patch" as const,
    };
    expect(shouldSkipHomeSyncPayload(payload)).toBe(true);
  });

  it("does not identical-skip when cache unread 5 matches payload but react row is still 0", () => {
    const cache = bootstrap([room("a", 5)]);
    primeBootstrapCache(cache);
    const react = bootstrap([room("a", 0)]);
    const payload = {
      chats: [room("a", 5)],
      roomMode: "critical_patch" as const,
    };
    expect(homeSyncPayloadNeedsReactUnreadSync(payload, react, cache)).toBe(true);
    expect(shouldSkipHomeSyncPayload(payload, { reactBase: react })).toBe(false);
  });

  it("defer flush invokes runner even when cache fingerprint already matches payload unread 5", () => {
    primeBootstrapCache(bootstrap([room("a", 5)]));
    const applied: unknown[] = [];
    registerDeferredHomeSyncRunner((payload) => {
      applied.push(payload);
    });

    beginLiteClientMergeGate();
    deferHomeSyncPatchDuringLiteMerge({
      chats: [room("a", 5)],
      roomMode: "critical_patch",
    });
    endLiteClientMergeGate();

    expect(applied).toHaveLength(1);
    const payload = applied[0] as { chats?: CommunityMessengerRoomSummary[] };
    expect(payload.chats?.[0]?.unreadCount).toBe(5);
  });
});
