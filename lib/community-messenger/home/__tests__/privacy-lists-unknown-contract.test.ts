import { describe, expect, it } from "vitest";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { communityMessengerBootstrapFromCriticalPayload } from "@/lib/community-messenger/home/critical-bootstrap-to-partial";
import { projectBootstrapPrivacyListOrUnknown } from "@/lib/community-messenger/home/bootstrap-privacy-lists-projection";
import {
  buildMessengerPrivacyListsPayload,
  messengerPrivacyListsHydrateIds,
} from "@/lib/community-messenger/home/messenger-privacy-lists-payload";
import {
  applyLocalBlockStatePatch,
  applyLocalFriendRemovedPatch,
  resolveMessengerBlockToggleIntent,
} from "@/lib/community-messenger/home/messenger-home-social-local-patch";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

function profile(id: string, extra: Partial<CommunityMessengerProfileLite> = {}): CommunityMessengerProfileLite {
  return {
    id,
    label: id,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: false,
    isFavoriteFriend: false,
    ...extra,
  };
}

function room(id: string, at = "2026-06-01T00:00:00.000Z"): CommunityMessengerRoomSummary {
  return {
    id,
    title: id,
    roomType: "direct",
    isPinned: false,
    unreadCount: 0,
    lastMessage: "m",
    lastMessageAt: at,
    lastMessageType: "text",
  } as CommunityMessengerRoomSummary;
}

function boot(partial: Partial<CommunityMessengerBootstrap>): CommunityMessengerBootstrap {
  return {
    me: profile("me"),
    tabs: { chats: 1, groups: 0, calls: 0, friends: 0 },
    friends: [],
    following: [],
    requests: [],
    chats: [room("r1")],
    groups: [],
    discoverableGroups: [],
    calls: [],
    ...partial,
  } as CommunityMessengerBootstrap;
}

const criticalPartial = () =>
  communityMessengerBootstrapFromCriticalPayload({
    tier: "critical",
    me: profile("me"),
    tabs: { chats: 1, groups: 0 },
    chats: [
      {
        room_id: "r1",
        room_type: "direct",
        direct_key: null,
        title: "r1",
        avatar_url: null,
        avatar_ref: null,
        last_message_preview: "hi",
        last_message_at: "2026-06-02T00:00:00.000Z",
        unread_count: 0,
        participant_labels_minimal: [
          { user_id: "me", label: "me", avatar_url: null },
          { user_id: "p", label: "p", avatar_url: null },
        ],
        group_meta: null,
      },
    ],
    groups: [],
  } as never);

describe("A-1(1) critical partial — hidden/blocked unknown", () => {
  it("emits hidden/blocked as undefined; other social keys keep [] semantics", () => {
    const p = criticalPartial();
    expect(p.hidden).toBeUndefined();
    expect(p.blocked).toBeUndefined();
    expect(p.friends).toEqual([]);
    expect(p.following).toEqual([]);
    expect(p.requests).toEqual([]);
  });

  it("bootstrap_apply_full with critical partial keeps base hidden/blocked", () => {
    const base = boot({ hidden: [profile("h1")], blocked: [profile("b1", { blocked: true })] });
    const next = applyHomeListPatch(base, { kind: "bootstrap_apply_full", next: criticalPartial() }, "bootstrap");
    expect(next?.hidden?.map((p) => p.id)).toEqual(["h1"]);
    expect(next?.blocked?.map((p) => p.id)).toEqual(["b1"]);
  });

  it("bootstrap_full_seed (prev has list) with critical partial keeps base lists", () => {
    const base = boot({ hidden: [profile("h1")], blocked: [profile("b1", { blocked: true })] });
    const next = applyHomeListPatch(base, { kind: "bootstrap_full_seed", bootstrap: criticalPartial() }, "bootstrap");
    expect(next?.hidden?.map((p) => p.id)).toEqual(["h1"]);
    expect(next?.blocked?.map((p) => p.id)).toEqual(["b1"]);
  });

  it("bootstrap_full_seed (prev has no rooms) replaces rooms but keeps base lists when unknown", () => {
    const base = boot({ chats: [], hidden: [profile("h1")], blocked: [profile("b1", { blocked: true })] });
    const next = applyHomeListPatch(base, { kind: "bootstrap_full_seed", bootstrap: criticalPartial() }, "bootstrap");
    expect(next?.chats.map((r) => r.id)).toEqual(["r1"]);
    expect(next?.hidden?.map((p) => p.id)).toEqual(["h1"]);
    expect(next?.blocked?.map((p) => p.id)).toEqual(["b1"]);
  });

  it("authoritative [] from full bootstrap still clears (approved semantics unchanged)", () => {
    const base = boot({ hidden: [profile("h1")], blocked: [profile("b1", { blocked: true })] });
    const next = applyHomeListPatch(
      base,
      { kind: "bootstrap_apply_full", next: boot({ hidden: [], blocked: [] }) },
      "bootstrap"
    );
    expect(next?.hidden).toEqual([]);
    expect(next?.blocked).toEqual([]);
  });
});

describe("A-1(2) lite projection — no filtered subset as complete", () => {
  const byId = new Map([
    ["a", profile("a")],
    ["b", profile("b")],
  ]);
  it("returns undefined when social source unknown (cache miss/empty)", () => {
    expect(projectBootstrapPrivacyListOrUnknown([], byId, false)).toBeUndefined();
    expect(projectBootstrapPrivacyListOrUnknown(["a"], byId, false)).toBeUndefined();
  });
  it("returns undefined when any id is not hydrated (blocked peer not a room participant)", () => {
    expect(projectBootstrapPrivacyListOrUnknown(["a", "x"], byId, true)).toBeUndefined();
  });
  it("returns full list when source known and all hydrated (incl. authoritative empty)", () => {
    expect(projectBootstrapPrivacyListOrUnknown(["a", "b"], byId, true)?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(projectBootstrapPrivacyListOrUnknown([], byId, true)).toEqual([]);
  });
});

describe("A-1(5) privacy-lists payload + privacy_lists_replace patch", () => {
  it("dedupes ids, excludes viewer, unions for single hydrate", () => {
    const ids = messengerPrivacyListsHydrateIds("me", ["b1", "b1", "me", " "], ["h1", "b1"]);
    expect(ids.blockedIds).toEqual(["b1"]);
    expect(ids.hiddenIds).toEqual(["h1", "b1"]);
    expect(ids.unionIds).toEqual(["b1", "h1"]);
  });

  it("builds full profiles; missing hydrate still keeps the person listed", () => {
    const payload = buildMessengerPrivacyListsPayload({
      blockedIds: ["b1", "ghost"],
      hiddenIds: ["h1"],
      profiles: [profile("b1", { label: "B one" }), profile("h1", { label: "H one" })],
    });
    expect(payload.ok).toBe(true);
    expect(payload.blocked.map((p) => [p.id, p.blocked])).toEqual([
      ["b1", true],
      ["ghost", true],
    ]);
    expect(payload.blocked[0]?.label).toBe("B one");
    expect(payload.hidden.map((p) => [p.id, p.isHiddenFriend])).toEqual([["h1", true]]);
  });

  it("replace patch only touches hidden/blocked; undefined field = unchanged", () => {
    const friends = [profile("f1", { isFriend: true })];
    const base = boot({ friends, hidden: [profile("h-old")], blocked: undefined });
    const next = applyHomeListPatch(
      base,
      { kind: "privacy_lists_replace", blocked: [profile("b1", { blocked: true })] },
      "bootstrap"
    );
    expect(next?.blocked?.map((p) => p.id)).toEqual(["b1"]);
    expect(next?.hidden?.map((p) => p.id)).toEqual(["h-old"]);
    expect(next?.friends).toBe(friends);
    expect(next?.chats).toBe(base.chats);
  });

  it("replace patch with [] clears; identical content keeps base reference", () => {
    const h = profile("h1");
    const base = boot({ hidden: [h], blocked: [] });
    const cleared = applyHomeListPatch(base, { kind: "privacy_lists_replace", hidden: [] }, "bootstrap");
    expect(cleared?.hidden).toEqual([]);
    const same = applyHomeListPatch(base, { kind: "privacy_lists_replace", hidden: [{ ...h }], blocked: [] }, "bootstrap");
    expect(same?.hidden).toBe(base.hidden);
  });
});

describe("A-2 block toggle intent — by-me only", () => {
  it("peer blocked me (search) → block (POST), not unblock", () => {
    expect(
      resolveMessengerBlockToggleIntent({
        targetUserId: "p",
        searchHit: { isBlockedByMe: false, isBlockedByPeer: true },
      })
    ).toBe("block");
  });
  it("I blocked them (search) → unblock", () => {
    expect(
      resolveMessengerBlockToggleIntent({ targetUserId: "p", searchHit: { isBlockedByMe: true, isBlockedByPeer: true } })
    ).toBe("unblock");
  });
  it("in my blocked list → unblock; pool profile.blocked (by-me) honored; default block", () => {
    expect(resolveMessengerBlockToggleIntent({ targetUserId: "p", blockedByMe: [profile("p")] })).toBe("unblock");
    expect(
      resolveMessengerBlockToggleIntent({ targetUserId: "p", pools: [[profile("p", { blocked: true })]] })
    ).toBe("unblock");
    expect(resolveMessengerBlockToggleIntent({ targetUserId: "p", pools: [[profile("p")]] })).toBe("block");
    expect(
      resolveMessengerBlockToggleIntent({ targetUserId: "p", sheetProfile: { id: "p", blocked: true } })
    ).toBe("unblock");
    expect(resolveMessengerBlockToggleIntent({ targetUserId: "p" })).toBe("block");
  });
});

describe("A-1(4) local block/unblock patch", () => {
  it("block: moves into blocked, removes from friends/hidden, flags copies", () => {
    const base = boot({
      friends: [profile("p", { isFriend: true }), profile("f2", { isFriend: true })],
      hidden: [profile("p", { isHiddenFriend: true })],
      following: [profile("p")],
      blocked: [profile("b0", { blocked: true })],
      tabs: { chats: 1, groups: 0, calls: 0, friends: 2 },
    });
    const next = applyLocalBlockStatePatch(base, "p", true);
    expect(next.friends.map((p) => p.id)).toEqual(["f2"]);
    expect(next.hidden?.map((p) => p.id)).toEqual([]);
    expect(next.blocked?.map((p) => [p.id, p.blocked])).toEqual([
      ["b0", true],
      ["p", true],
    ]);
    expect(next.following[0]?.blocked).toBe(true);
    expect(next.tabs.friends).toBe(1);
    expect(next.chats).toBe(base.chats);
  });

  it("block with unknown lists uses fallback profile and keeps hidden unknown", () => {
    const base = boot({ hidden: undefined, blocked: undefined });
    const next = applyLocalBlockStatePatch(base, "p", true, profile("p", { label: "Peer" }));
    expect(next.blocked?.map((p) => p.label)).toEqual(["Peer"]);
    expect(next.hidden).toBeUndefined();
  });

  it("unblock: removes from blocked, does not restore friend", () => {
    const base = boot({ blocked: [profile("p", { blocked: true })], following: [profile("p", { blocked: true })] });
    const next = applyLocalBlockStatePatch(base, "p", false);
    expect(next.blocked).toEqual([]);
    expect(next.friends).toEqual([]);
    expect(next.following[0]?.blocked).toBe(false);
  });
});

describe("A-5 friend delete — local removal survives never-shrink merge once cache primed", () => {
  it("removes from friends/hidden and recounts friends tab", () => {
    const base = boot({
      friends: [profile("p", { isFriend: true }), profile("f2", { isFriend: true })],
      hidden: [profile("p", { isHiddenFriend: true })],
      blocked: undefined,
    });
    const next = applyLocalFriendRemovedPatch(base, "p");
    expect(next.friends.map((p) => p.id)).toEqual(["f2"]);
    expect(next.hidden).toEqual([]);
    expect(next.blocked).toBeUndefined();
    expect(next.tabs.friends).toBe(1);
  });

  it("lite partial friends (union) after local removal does not resurrect when payload lacks the friend", () => {
    const base = applyLocalFriendRemovedPatch(
      boot({ friends: [profile("p", { isFriend: true }), profile("f2", { isFriend: true })] }),
      "p"
    );
    const next = applyHomeListPatch(
      base,
      { kind: "bootstrap_apply_full", next: boot({ friends: [profile("f2", { isFriend: true })] }) },
      "bootstrap"
    );
    expect(next?.friends.map((p) => p.id)).toEqual(["f2"]);
  });
});
