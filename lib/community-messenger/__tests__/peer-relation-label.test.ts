import { describe, expect, it } from "vitest";
import {
  isMutualFriendRelationLabel,
  resolvePeerRelationLabel,
  shouldShowStrangerPeerWarning,
} from "@/lib/community-messenger/peer-relation-label";
import { shouldShowStrangerPeerNotice } from "@/lib/community-messenger/peer-notices";

describe("peer-relation-label", () => {
  it("blocked overrides friendship", () => {
    expect(
      resolvePeerRelationLabel({
        blockedEitherWay: true,
        savedByMe: true,
        savedByPeer: true,
        friendship: { state: "accepted", source: "friendships_ssot" },
      })
    ).toBe("blocked");
  });

  it("mutual friend hides stranger warning", () => {
    expect(isMutualFriendRelationLabel("mutual_friend")).toBe(true);
    expect(shouldShowStrangerPeerWarning("mutual_friend")).toBe(false);
    expect(shouldShowStrangerPeerWarning("stranger")).toBe(true);
  });

  it("shouldShowStrangerPeerNotice for open direct stranger", () => {
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "stranger",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(true);
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "mutual_friend",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(false);
    expect(
      shouldShowStrangerPeerNotice({
        relationLabel: "saved_by_me",
        blockedByMe: false,
        blockedByPeer: false,
      })
    ).toBe(false);
  });
});
