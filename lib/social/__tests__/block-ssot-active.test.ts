import { describe, expect, it } from "vitest";
import { isActiveSocialBlockRow } from "@/lib/social/block-ssot-types";
import { shouldShowStrangerPeerNotice } from "@/lib/community-messenger/peer-notices";

describe("isActiveSocialBlockRow", () => {
  it("treats is_active=false as inactive block history", () => {
    expect(isActiveSocialBlockRow({ relation_type: "blocked", is_active: false })).toBe(false);
    expect(isActiveSocialBlockRow({ relation_type: "blocked", is_active: true })).toBe(true);
    expect(isActiveSocialBlockRow({ relation_type: "blocked", is_active: null })).toBe(true);
  });

  it("ignores friend rows", () => {
    expect(isActiveSocialBlockRow({ relation_type: "friend", is_active: true })).toBe(false);
  });
});

describe("shouldShowStrangerPeerNotice — friend vs block separation", () => {
  it("hides for saved_by_me and mutual_friend", () => {
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "saved_by_me",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(false);
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "mutual_friend",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(false);
  });

  it("shows for stranger and saved_by_peer", () => {
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "stranger",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(true);
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "saved_by_peer",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(true);
  });

  it("hides when blocked", () => {
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "stranger",
        blockedByMe: true,
        blockedByPeer: false,
      })
    ).toBe(false);
  });
});
