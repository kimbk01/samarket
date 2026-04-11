/**
 * 친구 IA용 상태 모델 — UI 표시·액션 범위를 상태별로 나눈다.
 * 데이터는 CommunityMessengerBootstrap 과 1:1 방 맵에서만 파생한다.
 */

import type { CommunityMessengerBootstrap, CommunityMessengerProfileLite, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type MessengerFriendRelationState =
  | "friend"
  | "favorite"
  | "hidden"
  | "blocked"
  | "requested_sent"
  | "requested_received"
  | "suggested"
  | "muted";

export type MessengerFriendState = {
  profile: CommunityMessengerProfileLite;
  states: MessengerFriendRelationState[];
};

export type MessengerFriendStateModel = {
  favorites: MessengerFriendState[];
  friends: MessengerFriendState[];
  hidden: MessengerFriendState[];
  blocked: MessengerFriendState[];
  requestedSent: MessengerFriendState[];
  requestedReceived: MessengerFriendState[];
  suggested: MessengerFriendState[];
  muted: MessengerFriendState[];
};

export function buildMessengerFriendStateModel(
  data: CommunityMessengerBootstrap | null,
  directRoomByPeerId: Map<string, CommunityMessengerRoomSummary>
): MessengerFriendStateModel {
  const blockedIds = new Set((data?.blocked ?? []).map((profile) => profile.id));
  const hiddenIds = new Set((data?.hidden ?? []).map((profile) => profile.id));
  const requestedSentIds = new Set(
    (data?.requests ?? []).filter((request) => request.direction === "outgoing").map((request) => request.addresseeId)
  );
  const requestedReceivedIds = new Set(
    (data?.requests ?? []).filter((request) => request.direction === "incoming").map((request) => request.requesterId)
  );
  const suggestedProfiles = (data?.following ?? []).filter(
    (profile) => !profile.isFriend && !blockedIds.has(profile.id) && !requestedSentIds.has(profile.id)
  );

  const allKnownProfiles = [
    ...(data?.friends ?? []),
    ...(data?.hidden ?? []),
    ...(data?.blocked ?? []),
    ...suggestedProfiles,
  ];

  const seen = new Set<string>();
  const states = allKnownProfiles
    .filter((profile) => {
      if (seen.has(profile.id)) return false;
      seen.add(profile.id);
      return true;
    })
    .map((profile) => {
      const room = directRoomByPeerId.get(profile.id);
      const nextStates: MessengerFriendRelationState[] = [];
      if (profile.isFriend) nextStates.push("friend");
      if (profile.isFavoriteFriend) nextStates.push("favorite");
      if (hiddenIds.has(profile.id) || profile.isHiddenFriend) nextStates.push("hidden");
      if (blockedIds.has(profile.id) || profile.blocked) nextStates.push("blocked");
      if (requestedSentIds.has(profile.id)) nextStates.push("requested_sent");
      if (requestedReceivedIds.has(profile.id)) nextStates.push("requested_received");
      if (suggestedProfiles.some((candidate) => candidate.id === profile.id)) nextStates.push("suggested");
      if (room?.isMuted) nextStates.push("muted");
      return { profile, states: nextStates };
    });

  return {
    favorites: states.filter((entry) => entry.states.includes("favorite") && !entry.states.includes("hidden")),
    friends: states.filter(
      (entry) => entry.states.includes("friend") && !entry.states.includes("blocked") && !entry.states.includes("hidden")
    ),
    hidden: states.filter((entry) => entry.states.includes("hidden")),
    blocked: states.filter((entry) => entry.states.includes("blocked")),
    requestedSent: states.filter((entry) => entry.states.includes("requested_sent")),
    requestedReceived: states.filter((entry) => entry.states.includes("requested_received")),
    suggested: states.filter((entry) => entry.states.includes("suggested")),
    muted: states.filter((entry) => entry.states.includes("muted")),
  };
}
