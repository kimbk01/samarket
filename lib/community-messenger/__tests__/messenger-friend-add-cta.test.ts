import { describe, expect, it } from "vitest";
import {
  pendingPeerSetsFromFriendRequests,
  resolveMessengerPeerSocialCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import type { CommunityMessengerFriendRequest, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

const baseProfile: CommunityMessengerProfileLite = {
  id: "u1",
  label: "User",
  avatarUrl: null,
  following: false,
  blocked: false,
  isFriend: false,
  isFavoriteFriend: false,
};

describe("resolveMessengerPeerSocialCta", () => {
  it("returns blocked when peer blocked", () => {
    expect(resolveMessengerPeerSocialCta({ ...baseProfile, blocked: true })).toEqual({ kind: "blocked" });
  });

  it("returns friend when isFriend", () => {
    expect(resolveMessengerPeerSocialCta({ ...baseProfile, isFriend: true })).toEqual({ kind: "friend" });
  });

  it("returns pending_outgoing when outgoing pending set has peer", () => {
    expect(
      resolveMessengerPeerSocialCta(baseProfile, { outgoingPendingPeerIds: new Set(["u1"]) })
    ).toEqual({ kind: "pending_outgoing" });
  });

  it("returns pending_incoming with request id", () => {
    expect(
      resolveMessengerPeerSocialCta(baseProfile, {
        incomingPendingByPeerId: new Map([["u1", "req-1"]]),
      })
    ).toEqual({ kind: "pending_incoming", requestId: "req-1" });
  });

  it("returns add_friend by default", () => {
    expect(resolveMessengerPeerSocialCta(baseProfile)).toEqual({ kind: "add_friend" });
  });
});

describe("pendingPeerSetsFromFriendRequests", () => {
  const requests: CommunityMessengerFriendRequest[] = [
    {
      id: "r-out",
      requesterId: "me",
      requesterLabel: "Me",
      addresseeId: "u2",
      addresseeLabel: "U2",
      status: "pending",
      direction: "outgoing",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "r-in",
      requesterId: "u3",
      requesterLabel: "U3",
      addresseeId: "me",
      addresseeLabel: "Me",
      status: "pending",
      direction: "incoming",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("splits outgoing peers and incoming request map", () => {
    const sets = pendingPeerSetsFromFriendRequests(requests, "me");
    expect([...sets.outgoingPendingPeerIds]).toEqual(["u2"]);
    expect(sets.incomingPendingByPeerId.get("u3")).toBe("r-in");
  });
});
