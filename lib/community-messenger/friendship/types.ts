import type { CommunityMessengerPeerRelationStatus } from "@/lib/community-messenger/types";

export type CommunityMessengerFriendshipDbStatus = "pending" | "accepted" | "blocked" | "removed";

export type CommunityMessengerFriendshipRow = {
  id: string;
  requesterUserId: string;
  addresseeUserId: string;
  status: CommunityMessengerFriendshipDbStatus;
  blockedByUserId: string | null;
  blockedAt: string | null;
  unblockedAt: string | null;
  readdBlockedUntil: string | null;
  acceptedAt: string | null;
  removedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CommunityMessengerFriendshipState = {
  status: CommunityMessengerPeerRelationStatus;
  friendshipStatus: CommunityMessengerFriendshipDbStatus | "none";
  friendshipId: string | null;
  canMessage: boolean;
  canCall: boolean;
  canAddFriend: boolean;
  canUnblock: boolean;
  isFriend: boolean;
  isBlockedByMe: boolean;
  isBlockedByPeer: boolean;
  readdBlockedUntil: string | null;
  requestRoomId: string | null;
  requestMessageId: string | null;
};

export type FriendshipActionResult = {
  ok: boolean;
  friendshipId?: string;
  roomId?: string;
  targetUserId?: string;
  readdBlockedUntil?: string | null;
  error?: string;
};

export type FriendshipDirectRoomEnsurer = (
  viewerUserId: string,
  peerUserId: string
) => Promise<{ ok: boolean; roomId?: string; error?: string }>;

export type FriendshipProfileHydrator = (
  viewerUserId: string,
  peerUserIds: string[]
) => Promise<Array<{ id: string; label: string; avatarUrl: string | null }>>;
