import { describe, expect, it } from "vitest";
import {
  mergeCommunityMessengerProfileFromBootstrap,
  resolveMessengerFriendAddCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import type { CommunityMessengerBootstrap, CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

const baseProfile = {
  id: "u1",
  label: "A",
  avatarUrl: null,
  following: false,
  blocked: false,
  isFriend: false,
  isFavoriteFriend: false,
};

function req(partial: Partial<CommunityMessengerFriendRequest> & Pick<CommunityMessengerFriendRequest, "id" | "direction">): CommunityMessengerFriendRequest {
  return {
    requesterId: "a",
    requesterLabel: "",
    addresseeId: "b",
    addresseeLabel: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("resolveMessengerFriendAddCta", () => {
  it("returns blocked when profile.blocked", () => {
    expect(resolveMessengerFriendAddCta({ ...baseProfile, blocked: true }, "me", [])).toEqual({ kind: "blocked" });
  });

  it("returns friend when isFriend", () => {
    expect(resolveMessengerFriendAddCta({ ...baseProfile, isFriend: true }, "me", [])).toEqual({ kind: "friend" });
  });

  it("returns pending_outgoing", () => {
    const r = req({
      id: "r1",
      direction: "outgoing",
      requesterId: "me",
      addresseeId: "u1",
    });
    expect(resolveMessengerFriendAddCta(baseProfile, "me", [r])).toEqual({ kind: "pending_outgoing", requestId: "r1" });
  });

  it("returns pending_incoming", () => {
    const r = req({
      id: "r2",
      direction: "incoming",
      requesterId: "u1",
      addresseeId: "me",
    });
    expect(resolveMessengerFriendAddCta(baseProfile, "me", [r])).toEqual({ kind: "pending_incoming", requestId: "r2" });
  });

  it("returns add when no row", () => {
    expect(resolveMessengerFriendAddCta(baseProfile, "me", [])).toEqual({ kind: "add" });
  });
});

describe("mergeCommunityMessengerProfileFromBootstrap", () => {
  it("merges friend flags from friends list", () => {
    const bootstrap = {
      me: null,
      tabs: { friends: 0, chats: 0, groups: 0, calls: 0 },
      friends: [{ ...baseProfile, id: "u1", isFriend: true, label: "B" }],
      following: [],
      hidden: [],
      blocked: [],
      requests: [],
      chats: [],
      groups: [],
      discoverableGroups: [],
      calls: [],
    } satisfies CommunityMessengerBootstrap;
    const merged = mergeCommunityMessengerProfileFromBootstrap(baseProfile, bootstrap);
    expect(merged.isFriend).toBe(true);
    expect(merged.label).toBe("B");
  });
});
