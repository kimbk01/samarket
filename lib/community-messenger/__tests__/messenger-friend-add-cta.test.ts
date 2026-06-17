import { describe, expect, it } from "vitest";
import { resolveMessengerPeerSocialCta } from "@/lib/community-messenger/messenger-friend-add-cta";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

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

  it("returns add_friend by default", () => {
    expect(resolveMessengerPeerSocialCta(baseProfile)).toEqual({ kind: "add_friend" });
  });
});
