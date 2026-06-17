import type { CommunityMessengerBootstrap, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

/**
 * CM peer social CTA — 승인 기반 mutual friend.
 */
export type MessengerPeerSocialCta =
  | { kind: "add_friend" }
  | { kind: "friend" }
  | { kind: "blocked" };

import type { MessageKey } from "@/lib/i18n/messages";

export const MessengerPeerSocialCtaLabelKeys = {
  addFriend: "cm_social_add_friend",
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
  peer: Pick<CommunityMessengerProfileLite, "id" | "isFriend" | "blocked">
): MessengerPeerSocialCta {
  if (peer.blocked) return { kind: "blocked" };
  if (peer.isFriend) return { kind: "friend" };
  return { kind: "add_friend" };
}

/** @deprecated */
export function resolveMessengerFriendAddCta(
  peer: Pick<CommunityMessengerProfileLite, "id" | "isFriend" | "blocked">
): MessengerPeerSocialCta {
  return resolveMessengerPeerSocialCta(peer);
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
