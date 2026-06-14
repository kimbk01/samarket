import type {
  CommunityMessengerBootstrap,
  CommunityMessengerFriendRequest,
  CommunityMessengerFriendRequestStatus,
  CommunityMessengerProfileLite,
} from "@/lib/community-messenger/types";

export type FriendRequestOutcomeStatus = Exclude<
  CommunityMessengerFriendRequestStatus,
  "pending" | "blocked"
>;

export type ApplyFriendRequestOutcomeInput = {
  meId: string;
  requesterUserId: string;
  addresseeUserId: string;
  requestId: string;
  status: FriendRequestOutcomeStatus;
  peerId: string;
  peerLabel?: string;
  acceptedAt?: string;
  peerFallbackLabel: string;
};

export type ApplyFriendRequestOutcomeResult = {
  bootstrap: CommunityMessengerBootstrap;
  resolvedPeerLabel: string;
  isRequesterViewer: boolean;
  shouldShowAcceptSnackbar: boolean;
  shouldShowRejectSnackbar: boolean;
  shouldApplyRejectCooldown: boolean;
  shouldRefreshBootstrap: boolean;
  shouldNavigateFriendsTab: boolean;
};

function trimId(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

function shouldRemoveRequest(
  request: CommunityMessengerFriendRequest,
  meId: string,
  requestId: string,
  peerId: string
): boolean {
  if (request.id === requestId) return true;
  if (!peerId || request.status !== "pending") return false;
  return (
    (request.requesterId === meId && request.addresseeId === peerId) ||
    (request.requesterId === peerId && request.addresseeId === meId)
  );
}

export function resolveFriendRequestPeerLabel(
  requests: CommunityMessengerFriendRequest[],
  meId: string,
  peerId: string,
  requestId: string,
  explicitLabel: string | undefined,
  fallbackLabel: string
): string {
  const explicit = trimId(explicitLabel);
  if (explicit) return explicit;
  const hit =
    requests.find((r) => r.id === requestId) ??
    requests.find(
      (r) =>
        r.status === "pending" &&
        ((r.requesterId === meId && r.addresseeId === peerId) ||
          (r.requesterId === peerId && r.addresseeId === meId))
    );
  if (!hit) return fallbackLabel;
  if (hit.requesterId === meId) return trimId(hit.addresseeLabel) || fallbackLabel;
  return trimId(hit.requesterLabel) || fallbackLabel;
}

function buildAcceptedFriendProfile(
  peerId: string,
  label: string,
  acceptedAt: string
): CommunityMessengerProfileLite {
  return {
    id: peerId,
    label,
    subtitle: "",
    bio: null,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
    isHiddenFriend: false,
    friendshipAcceptedAt: acceptedAt,
  };
}

export function applyFriendRequestOutcomeToHomeState(
  prev: CommunityMessengerBootstrap | null,
  input: ApplyFriendRequestOutcomeInput
): ApplyFriendRequestOutcomeResult | null {
  if (!prev?.me?.id) return null;

  const meId = trimId(input.meId);
  const requestId = trimId(input.requestId);
  const peerId = trimId(input.peerId);
  const requesterUserId = trimId(input.requesterUserId);
  const addresseeUserId = trimId(input.addresseeUserId);
  if (!meId || !requestId || !peerId) return null;

  const isRequesterViewer = meId === requesterUserId;
  const resolvedPeerLabel = resolveFriendRequestPeerLabel(
    prev.requests ?? [],
    meId,
    peerId,
    requestId,
    input.peerLabel,
    input.peerFallbackLabel
  );

  const nextRequests = (prev.requests ?? []).filter(
    (r) => !shouldRemoveRequest(r, meId, requestId, peerId)
  );

  let nextFriends = prev.friends ?? [];
  if (input.status === "accepted" && peerId) {
    const acceptedAt = trimId(input.acceptedAt) || new Date().toISOString();
    const existingIdx = nextFriends.findIndex((f) => f.id === peerId);
    if (existingIdx < 0) {
      nextFriends = [
        ...nextFriends,
        buildAcceptedFriendProfile(peerId, resolvedPeerLabel, acceptedAt),
      ];
    } else if (!trimId(nextFriends[existingIdx]?.friendshipAcceptedAt)) {
      nextFriends = nextFriends.map((f) =>
        f.id === peerId ? { ...f, isFriend: true, friendshipAcceptedAt: acceptedAt } : f
      );
    }
  }

  const bootstrap: CommunityMessengerBootstrap = {
    ...prev,
    requests: nextRequests,
    friends: nextFriends,
    tabs:
      input.status === "accepted" && nextFriends.length !== (prev.friends ?? []).length
        ? { ...prev.tabs, friends: nextFriends.length }
        : prev.tabs,
  };

  return {
    bootstrap,
    resolvedPeerLabel,
    isRequesterViewer,
    shouldShowAcceptSnackbar: input.status === "accepted" && isRequesterViewer,
    shouldShowRejectSnackbar: input.status === "rejected" && isRequesterViewer,
    shouldApplyRejectCooldown: input.status === "rejected" && isRequesterViewer,
    shouldRefreshBootstrap:
      input.status === "cancelled" ||
      (isRequesterViewer && (input.status === "accepted" || input.status === "rejected")),
    shouldNavigateFriendsTab: input.status === "accepted" && isRequesterViewer,
  };
}
