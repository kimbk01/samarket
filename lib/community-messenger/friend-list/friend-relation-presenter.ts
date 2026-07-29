import {
  isMessengerNewFriend,
  MESSENGER_NEW_FRIEND_WINDOW_MS,
} from "@/lib/community-messenger/messenger-new-friend-window";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

export type FriendRelationDisplayStatus =
  | "me"
  | "friend"
  | "new_friend"
  | "blocked_by_me"
  | "blocked_me"
  | "hidden"
  | "muted"
  | "favorite";

export type FriendListRowViewModel = {
  profileId: string;
  displayName: string;
  publicId: string | null;
  avatarUrl: string | null;
  status: FriendRelationDisplayStatus;
  statusBadgeKey: string;
  statusBadgeColor: string;
  isFavorite: boolean;
  isNewFriend: boolean;
  subtitle: string | null;
  canAddFriend: boolean;
  readdBlockedUntil: string | null;
};

export type FriendRelationPresenterInput = {
  profile: CommunityMessengerProfileLite;
  viewerUserId: string;
  isMe?: boolean;
  isFavorite?: boolean;
  isHidden?: boolean;
  isMuted?: boolean;
  blockedByMe?: boolean;
  blockedMe?: boolean;
  readdBlockedUntil?: string | null;
  nowMs?: number;
};

const STATUS_BADGE: Record<
  Exclude<FriendRelationDisplayStatus, "me" | "favorite">,
  { key: string; color: string }
> = {
  friend: { key: "cm_friend_badge_friend", color: "#006241" },
  new_friend: { key: "cm_friend_badge_new", color: "#006241" },
  blocked_by_me: { key: "cm_friend_badge_blocked", color: "#E53935" },
  blocked_me: { key: "cm_friend_badge_blocked", color: "#E53935" },
  hidden: { key: "cm_friend_badge_hidden", color: "#6B7280" },
  muted: { key: "cm_friend_badge_muted", color: "#6B7280" },
};

export function resolveFriendRelationDisplayStatus(
  input: FriendRelationPresenterInput
): FriendRelationDisplayStatus {
  if (input.isMe) return "me";
  if (input.blockedByMe) return "blocked_by_me";
  if (input.blockedMe) return "blocked_me";
  if (input.isHidden) return "hidden";
  if (input.isMuted) return "muted";
  const nowMs = input.nowMs ?? Date.now();
  if (input.profile.isFriend && isMessengerNewFriend(input.profile, nowMs, MESSENGER_NEW_FRIEND_WINDOW_MS)) {
    return "new_friend";
  }
  if (input.profile.isFriend && input.isFavorite) return "favorite";
  if (input.profile.isFriend) return "friend";
  return "friend";
}

export function presentFriendListRow(input: FriendRelationPresenterInput): FriendListRowViewModel {
  const status = resolveFriendRelationDisplayStatus(input);
  const nowMs = input.nowMs ?? Date.now();
  const isNewFriend =
    input.profile.isFriend && isMessengerNewFriend(input.profile, nowMs, MESSENGER_NEW_FRIEND_WINDOW_MS);
  const badge =
    status === "me"
      ? { key: "cm_friend_badge_me", color: "#006241" }
      : status === "favorite"
        ? STATUS_BADGE.friend
        : STATUS_BADGE[status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.friend;

  const readdUntil = input.readdBlockedUntil ?? null;
  const canAddFriend =
    !input.profile.isFriend &&
    !input.blockedByMe &&
    !input.blockedMe &&
    (!readdUntil || Number.isNaN(Date.parse(readdUntil)) || Date.parse(readdUntil) <= nowMs);

  return {
    profileId: input.profile.id,
    displayName: incomingCallPeerNicknameLabel(input.profile.label) || input.profile.label,
    publicId: input.profile.subtitle?.trim().replace(/^@+/, "") || null,
    avatarUrl: input.profile.avatarUrl ?? null,
    status,
    statusBadgeKey: badge.key,
    statusBadgeColor: badge.color,
    isFavorite: Boolean(input.isFavorite),
    isNewFriend,
    subtitle: input.profile.bio?.trim() || null,
    canAddFriend,
    readdBlockedUntil: readdUntil,
  };
}

export type FriendListSectionKey = "me" | "favorite" | "new" | "friends" | "hidden" | "blocked" | "muted";

export function friendListSectionForStatus(status: FriendRelationDisplayStatus): FriendListSectionKey | null {
  switch (status) {
    case "me":
      return "me";
    case "favorite":
      return "favorite";
    case "new_friend":
      return "new";
    case "friend":
      return "friends";
    case "hidden":
      return "hidden";
    case "blocked_by_me":
    case "blocked_me":
      return "blocked";
    case "muted":
      return "muted";
    default:
      return "friends";
  }
}
