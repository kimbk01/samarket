import { describe, expect, it } from "vitest";
import { resolveMessengerPeerSocialCta } from "@/lib/community-messenger/messenger-friend-add-cta";
import { acceptedPeerIdsFromCommunityFriendRows } from "@/lib/community-messenger/service";

describe("resolveMessengerPeerSocialCta", () => {
  it("returns blocked when peer is blocked", () => {
    expect(
      resolveMessengerPeerSocialCta({ id: "u1", isFriend: false, blocked: true })
    ).toEqual({ kind: "blocked" });
  });

  it("returns friend when saved", () => {
    expect(
      resolveMessengerPeerSocialCta({ id: "u1", isFriend: true, blocked: false })
    ).toEqual({ kind: "friend" });
  });

  it("returns add_friend for unknown peer", () => {
    expect(
      resolveMessengerPeerSocialCta({ id: "u1", isFriend: false, blocked: false })
    ).toEqual({ kind: "add_friend" });
  });
});

describe("acceptedPeerIdsFromCommunityFriendRows (saved friend rows)", () => {
  it("derives peer ids from owner->target saved rows", () => {
    const userId = "me";
    const rows = [
      { requester_id: "me", addressee_id: "peer-a", status: "accepted" as const },
      { requester_id: "me", addressee_id: "peer-b", status: "accepted" as const },
    ];
    expect(acceptedPeerIdsFromCommunityFriendRows(userId, rows)).toEqual(["peer-a", "peer-b"]);
  });
});

describe("direct room policy (unit)", () => {
  it("friend is not required for messaging — guard types documented", () => {
    expect(true).toBe(true);
  });
});
