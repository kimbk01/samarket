import { describe, expect, it } from "vitest";
import {
  isMutualFriendRelationLabel,
  peerRelationLabelFromPendingFriendshipRow,
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

  it("peerRelationLabelFromPendingFriendshipRow maps requester to saved_by_me", () => {
    const requester = "11111111-1111-1111-1111-111111111111";
    const addressee = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
    expect(
      peerRelationLabelFromPendingFriendshipRow(requester, {
        requester_user_id: requester,
        addressee_user_id: addressee,
      })
    ).toBe("saved_by_me");
  });

  it("peerRelationLabelFromPendingFriendshipRow maps addressee to saved_by_peer", () => {
    const requester = "11111111-1111-1111-1111-111111111111";
    const addressee = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
    expect(
      peerRelationLabelFromPendingFriendshipRow(addressee, {
        requester_user_id: requester,
        addressee_user_id: addressee,
      })
    ).toBe("saved_by_peer");
  });
});
