import type { CommunityMessengerBootstrap, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

/**
 * CM peer social CTA — mutual friend request.
 */
export type MessengerPeerSocialCta =
  | { kind: "add_friend" }
  | { kind: "pending_outgoing" }
  | { kind: "pending_incoming"; requestId: string }
  | { kind: "friend" }
  | { kind: "blocked" };

import type { MessageKey } from "@/lib/i18n/messages";

export const MessengerPeerSocialCtaLabelKeys = {
  addFriend: "cm_friend_cta_send_request",
  pendingOutgoing: "cm_friend_friends_tab_sent_waiting",
  pendingIncoming: "cm_friend_cta_accept",
  friend: "cm_friend_cta_friend",
  message: "cm_social_send_message",
  unavailable: "cm_social_cannot_start_chat",
  blockedChip: "cm_friend_cta_blocked",
  removeFriend: "cm_social_remove_friend",
  block: "cm_social_block",
  unblock: "cm_social_unblock",
} as const satisfies Record<string, MessageKey>;

/** @deprecated use MessengerPeerSocialCta */
export type MessengerFriendAddCta = MessengerPeerSocialCta;

/** @deprecated use MessengerPeerSocialCtaLabelKeys */
export const MessengerFriendAddCtaLabelKeys = MessengerPeerSocialCtaLabelKeys;

export function resolveMessengerPeerSocialCta(
  peer: Pick<CommunityMessengerProfileLite, "id" | "isFriend" | "blocked">,
  opts?: {
    outgoingPendingPeerIds?: ReadonlySet<string> | Iterable<string>;
    incomingPendingByPeerId?: ReadonlyMap<string, string>;
  }
): MessengerPeerSocialCta {
  if (peer.blocked) return { kind: "blocked" };
  if (peer.isFriend) return { kind: "friend" };
  const peerId = String(peer.id ?? "").trim();
  if (peerId && opts?.incomingPendingByPeerId?.has(peerId)) {
    return {
      kind: "pending_incoming",
      requestId: String(opts.incomingPendingByPeerId.get(peerId) ?? "").trim(),
    };
  }
  const outgoing =
    opts?.outgoingPendingPeerIds instanceof Set
      ? opts.outgoingPendingPeerIds
      : new Set(opts?.outgoingPendingPeerIds ?? []);
  if (peerId && outgoing.has(peerId)) return { kind: "pending_outgoing" };
  return { kind: "add_friend" };
}

/** @deprecated */
export function resolveMessengerFriendAddCta(
  peer: Pick<CommunityMessengerProfileLite, "id" | "isFriend" | "blocked">,
  opts?: {
    outgoingPendingPeerIds?: ReadonlySet<string> | Iterable<string>;
    incomingPendingByPeerId?: ReadonlyMap<string, string>;
  }
): MessengerPeerSocialCta {
  return resolveMessengerPeerSocialCta(peer, opts);
}

export function pendingPeerSetsFromFriendRequests(
  requests: CommunityMessengerBootstrap["requests"] | null | undefined,
  viewerId: string
): {
  outgoingPendingPeerIds: Set<string>;
  incomingPendingByPeerId: Map<string, string>;
} {
  const outgoingPendingPeerIds = new Set<string>();
  const incomingPendingByPeerId = new Map<string, string>();
  const me = String(viewerId ?? "").trim();
  for (const req of requests ?? []) {
    if (req.status !== "pending") continue;
    if (req.direction === "outgoing" || req.requesterId === me) {
      const peer = String(req.addresseeId ?? "").trim();
      if (peer) outgoingPendingPeerIds.add(peer);
    } else if (req.direction === "incoming" || req.addresseeId === me) {
      const peer = String(req.requesterId ?? "").trim();
      const rid = String(req.id ?? "").trim();
      if (peer && rid) incomingPendingByPeerId.set(peer, rid);
    }
  }
  return { outgoingPendingPeerIds, incomingPendingByPeerId };
}

export function mergeCommunityMessengerProfileFromBootstrap(
  profile: CommunityMessengerProfileLite,
  bootstrap: CommunityMessengerBootstrap | null
): CommunityMessengerProfileLite {
  if (!bootstrap) return profile;
  const id = profile.id;
  const pools = [
    ...(bootstrap.friends ?? []),
    ...(bootstrap.hidden ?? []),
    ...(bootstrap.blocked ?? []),
    ...(bootstrap.following ?? []),
  ];
  const hit = pools.find((p) => p.id === id);
  if (!hit) return profile;
  return { ...profile, ...hit };
}
