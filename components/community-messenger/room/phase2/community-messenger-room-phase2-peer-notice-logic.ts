import {
  isViewerRecipientOfInboundDirectChat,
  shouldShowStrangerPeerNotice,
  type InboundDirectChatMessage,
} from "@/lib/community-messenger/peer-notices";
import type { PeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type PeerNoticeBranch = "none" | "blocked" | "add_contact";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** P2 — first-message recipient (B) vs initiator (A); empty room uses owner fallback. */
export function resolveDirectChatInboundRecipient(input: {
  viewerUserId: string;
  peerUserId: string;
  roomOwnerUserId?: string | null;
  messages: ReadonlyArray<InboundDirectChatMessage>;
}): boolean {
  const viewer = trimText(input.viewerUserId);
  const peer = trimText(input.peerUserId);
  if (!viewer || !peer) return false;

  const chatMessages = input.messages.filter((message) => {
    const type = trimText(message.messageType);
    if (type === "system" || type === "call_stub") return false;
    return Boolean(trimText(message.senderId));
  });

  if (chatMessages.length > 0) {
    return isViewerRecipientOfInboundDirectChat({
      viewerUserId: viewer,
      peerUserId: peer,
      messages: input.messages,
    });
  }

  const owner = trimText(input.roomOwnerUserId);
  if (owner && owner === viewer) return false;
  return false;
}

function isViewerContactSaved(input: {
  peerRelationLabel: PeerRelationLabel;
  peerFriendshipState?: CommunityMessengerRoomSnapshot["peerFriendshipState"];
}): boolean {
  if (input.peerFriendshipState === "accepted") return true;
  return (
    input.peerRelationLabel === "saved_by_me" ||
    input.peerRelationLabel === "mutual_friend"
  );
}

export function resolvePeerNoticeBranch(input: {
  isGeneralFriendDirect: boolean;
  roomType: string;
  peerUserId: string;
  blockedByMe: boolean;
  blockedByPeer: boolean;
  peerFriendshipState?: CommunityMessengerRoomSnapshot["peerFriendshipState"];
  peerRelationLabel: PeerRelationLabel;
  isInboundRecipient: boolean;
}): PeerNoticeBranch {
  if (input.roomType !== "direct" || !input.peerUserId.trim() || !input.isGeneralFriendDirect) {
    return "none";
  }
  if (input.blockedByMe) return "blocked";
  if (
    isViewerContactSaved({
      peerRelationLabel: input.peerRelationLabel,
      peerFriendshipState: input.peerFriendshipState,
    })
  ) {
    return "none";
  }
  // Telegram Contact: show Add|Block for any non-friend general 1:1 (search or inbound).
  // Do not surface "blocked by peer" explicitly — stranger notice helper still gates exposure.
  void input.isInboundRecipient;
  if (
    !shouldShowStrangerPeerNotice({
      relationLabel: input.peerRelationLabel,
      blockedByMe: input.blockedByMe,
      blockedByPeer: input.blockedByPeer,
    })
  ) {
    return "none";
  }
  return "add_contact";
}

/** Dot menu — allow Add Contact for any non-friend general 1:1 (initiator or recipient). */
export function shouldHidePeerAddContactForInitiator(input: {
  isGeneralFriendDirect: boolean;
  isInboundRecipient: boolean;
  isContactSaved: boolean;
}): boolean {
  if (!input.isGeneralFriendDirect) return false;
  if (input.isContactSaved) return false;
  void input.isInboundRecipient;
  return false;
}
