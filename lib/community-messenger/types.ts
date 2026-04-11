export type CommunityMessengerTab = "friends" | "chats" | "groups" | "calls";

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

/** 스냅샷·배너 등에서 「진행 중인 통화」로 취급할 수 있는 세션 상태 */
export function communityMessengerCallSessionIsLive(status: CommunityMessengerCallSessionStatus): boolean {
  return status === "ringing" || status === "active";
}

/**
 * 채팅방 하단 「통화 진행 중」 플로팅 배너 — 실제 미디어 연결 후에만 표시.
 * `ringing`(발신/수신 대기)은 통화 로그·헤더 버튼으로 충분하고, 여기까지 켜 두면 종료 후에도
 * DB가 잠시 `ringing`으로 남을 때 배너가 떠 있는 것처럼 보이는 문제가 생긴다.
 */
export function communityMessengerCallSessionIsActiveConnected(status: CommunityMessengerCallSessionStatus): boolean {
  return status === "active";
}
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
  isMuted?: boolean;
  isPinned?: boolean;
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
  /**
   * `community_messenger_participants.is_archived` — 내 목록에서만 숨김(보관함).
   * `roomStatus` 는 `community_messenger_rooms` 의 운영 상태(active/blocked/archived)만 반영한다.
   */
  isArchivedByViewer?: boolean;
};

/** 메인 대화 목록·「보관됨」필터 — 운영상 폐쇄(방 archived) 또는 개인 보관 */
export function communityMessengerRoomIsInboxHidden(
  room: Pick<CommunityMessengerRoomSummary, "roomStatus" | "isArchivedByViewer">
): boolean {
  return room.roomStatus === "archived" || Boolean(room.isArchivedByViewer);
}

/** 메시지·통화 가능 여부(운영 차단/폐쇄/읽기전용). 개인 보관과 무관. */
export function communityMessengerRoomIsGloballyUsable(
  room: Pick<CommunityMessengerRoomSummary, "roomStatus" | "isReadonly">
): boolean {
  if (room.isReadonly) return false;
  return room.roomStatus === "active";
}

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
  /** messageType === "voice" 일 때 0–1 막대 높이 (텔레그램 스타일 파형) */
  voiceWaveformPeaks?: number[] | null;
  /** 클라이언트 전용: 전송 대기(blob) 음성의 MIME — `<audio type>`·재생 호환용 */
  voiceMimeType?: string | null;
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
