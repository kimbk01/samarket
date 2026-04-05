export type CommunityMessengerTab = "friends" | "chats" | "groups" | "calls" | "settings";

export type CommunityMessengerRoomType = "direct" | "private_group" | "open_group";
export type CommunityMessengerRoomStatus = "active" | "blocked" | "archived";
export type CommunityMessengerRoomVisibility = "private" | "public";
export type CommunityMessengerRoomJoinPolicy = "invite_only" | "password" | "free";
export type CommunityMessengerIdentityMode = "real_name" | "alias";
export type CommunityMessengerRoomIdentityPolicy = "real_name" | "alias_allowed";
export type CommunityMessengerMessageType = "text" | "image" | "system" | "call_stub" | "voice";
export type CommunityMessengerCallKind = "voice" | "video";
export type CommunityMessengerCallStatus =
  | "dialing"
  | "incoming"
  | "missed"
  | "cancelled"
  | "rejected"
  | "ended";
export type CommunityMessengerCallSessionStatus =
  | "ringing"
  | "active"
  | "ended"
  | "rejected"
  | "missed"
  | "cancelled";
export type CommunityMessengerCallSessionMode = "direct" | "group";
export type CommunityMessengerCallSignalType = "offer" | "answer" | "ice-candidate" | "hangup";
export type CommunityMessengerCallParticipantStatus = "invited" | "joined" | "left" | "rejected";
export type CommunityMessengerFriendRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "blocked";

export type CommunityMessengerProfileLite = {
  id: string;
  label: string;
  subtitle?: string;
  avatarUrl: string | null;
  identityMode?: CommunityMessengerIdentityMode;
  aliasProfile?: {
    displayName: string;
    bio: string;
    avatarUrl: string | null;
  } | null;
  following: boolean;
  blocked: boolean;
  isFriend: boolean;
  isFavoriteFriend: boolean;
};

export type CommunityMessengerFriendRequest = {
  id: string;
  requesterId: string;
  requesterLabel: string;
  addresseeId: string;
  addresseeLabel: string;
  status: CommunityMessengerFriendRequestStatus;
  direction: "incoming" | "outgoing";
  createdAt: string;
};

export type CommunityMessengerRoomSummary = {
  id: string;
  roomType: CommunityMessengerRoomType;
  roomStatus: CommunityMessengerRoomStatus;
  visibility: CommunityMessengerRoomVisibility;
  joinPolicy: CommunityMessengerRoomJoinPolicy;
  identityPolicy: CommunityMessengerRoomIdentityPolicy;
  isReadonly: boolean;
  title: string;
  subtitle: string;
  summary: string;
  avatarUrl: string | null;
  unreadCount: number;
  lastMessage: string;
  lastMessageAt: string;
  memberCount: number;
  ownerUserId: string | null;
  ownerLabel: string;
  memberLimit: number | null;
  isDiscoverable: boolean;
  requiresPassword: boolean;
  allowMemberInvite: boolean;
  myIdentityMode?: CommunityMessengerIdentityMode;
  peerUserId?: string | null;
};

export type CommunityMessengerDiscoverableGroupSummary = {
  id: string;
  roomType: "open_group";
  roomStatus: CommunityMessengerRoomStatus;
  visibility: "public";
  joinPolicy: "password" | "free";
  identityPolicy: CommunityMessengerRoomIdentityPolicy;
  title: string;
  summary: string;
  ownerUserId: string | null;
  ownerLabel: string;
  memberCount: number;
  memberLimit: number | null;
  isDiscoverable: boolean;
  requiresPassword: boolean;
  lastMessage: string;
  lastMessageAt: string;
  isJoined: boolean;
};

export type CommunityMessengerMessage = {
  id: string;
  roomId: string;
  senderId: string | null;
  senderLabel: string;
  messageType: CommunityMessengerMessageType;
  content: string;
  createdAt: string;
  isMine: boolean;
  callKind?: CommunityMessengerCallKind | null;
  callStatus?: CommunityMessengerCallStatus | null;
  /** messageType === "voice" 일 때 재생 URL(보통 content 와 동일) */
  voiceDurationSeconds?: number | null;
};

export type CommunityMessengerRoomSnapshot = {
  viewerUserId: string;
  room: CommunityMessengerRoomSummary & {
    description?: string;
  };
  members: CommunityMessengerProfileLite[];
  messages: CommunityMessengerMessage[];
  myRole: "owner" | "admin" | "member";
  activeCall: CommunityMessengerCallSession | null;
};

export type CommunityMessengerCallLog = {
  id: string;
  roomId: string | null;
  sessionMode: CommunityMessengerCallSessionMode;
  title: string;
  peerLabel: string;
  peerUserId: string | null;
  participantCount: number;
  participantLabels: string[];
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  startedAt: string;
  durationSeconds: number;
};

export type CommunityMessengerCallSession = {
  id: string;
  roomId: string;
  sessionMode: CommunityMessengerCallSessionMode;
  initiatorUserId: string;
  recipientUserId: string | null;
  peerUserId: string | null;
  peerLabel: string;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  isMineInitiator: boolean;
  participants: CommunityMessengerCallParticipant[];
};

export type CommunityMessengerCallParticipant = {
  userId: string;
  label: string;
  status: CommunityMessengerCallParticipantStatus;
  joinedAt: string | null;
  leftAt: string | null;
  isMe: boolean;
};

export type CommunityMessengerCallSignal = {
  id: string;
  sessionId: string;
  roomId: string;
  fromUserId: string;
  toUserId: string;
  signalType: CommunityMessengerCallSignalType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CommunityMessengerManagedCallConnection = {
  provider: "agora";
  appId: string;
  channelName: string;
  uid: string;
  token: string | null;
  expiresAt: string | null;
  callKind: CommunityMessengerCallKind;
};

export type CommunityMessengerBootstrap = {
  me: CommunityMessengerProfileLite | null;
  tabs: Record<CommunityMessengerTab, number>;
  friends: CommunityMessengerProfileLite[];
  following: CommunityMessengerProfileLite[];
  blocked: CommunityMessengerProfileLite[];
  requests: CommunityMessengerFriendRequest[];
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  discoverableGroups: CommunityMessengerDiscoverableGroupSummary[];
  calls: CommunityMessengerCallLog[];
};

export type CommunityMessengerRoomAliasProfile = {
  identityMode: CommunityMessengerIdentityMode;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
};

export function isCommunityMessengerGroupRoomType(roomType: CommunityMessengerRoomType): boolean {
  return roomType === "private_group" || roomType === "open_group";
}
