import type {
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import type { CommunityMessengerUserSearchResult } from "@/lib/community-messenger/user-public-id-search";

export type DirectPeerInstantEntryPeer = Pick<
  CommunityMessengerUserSearchResult,
  "id" | "displayName" | "avatarUrl" | "isFriend" | "isBlockedByMe"
>;

/**
 * @아이디 검색 → 메시지 보내기 직후 방 진입용 최소 스냅샷.
 * `clientShellPlaceholder` 가 아니므로 BootstrapGate·⋮ 통화가 즉시 `roomId`·peer 를 사용할 수 있다.
 */
export function buildDirectPeerInstantEntrySnapshot(input: {
  roomId: string;
  viewerUserId: string;
  peer: DirectPeerInstantEntryPeer;
  relationStatus?: "pending" | "accepted" | "declined" | "blocked" | null;
  lastMessage?: string | null;
}): CommunityMessengerRoomSnapshot {
  const roomId = input.roomId.trim();
  const viewerUserId = input.viewerUserId.trim();
  const peerId = input.peer.id.trim();
  const title = input.peer.displayName.trim() || peerId;
  const avatarUrl = input.peer.avatarUrl?.trim() || null;
  const lastMessage = input.lastMessage?.trim() || "";
  const now = new Date().toISOString();

  const peerMember: CommunityMessengerProfileLite = {
    id: peerId,
    label: title,
    avatarUrl,
    following: false,
    blocked: Boolean(input.peer.isBlockedByMe),
    isFriend: Boolean(input.peer.isFriend),
    isFavoriteFriend: false,
  };

  return {
    viewerUserId,
    bootstrapEnrichmentPending: true,
    membersDeferred: true,
    room: {
      id: roomId,
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "alias_allowed",
      isReadonly: false,
      title,
      subtitle: "",
      summary: "",
      avatarUrl,
      unreadCount: 0,
      lastMessage,
      lastMessageAt: now,
      memberCount: 2,
      ownerUserId: null,
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
      peerUserId: peerId,
      relationStatus: input.relationStatus ?? (input.peer.isFriend ? "accepted" : "pending"),
      description: "",
    },
    members: [peerMember],
    messages: [],
    hasMoreOlderMessages: false,
    myRole: "member",
    activeCall: null,
  };
}
