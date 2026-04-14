import type { ChatRoom } from "@/lib/types/chat";

export type CommunityMessengerTab = "friends" | "chats" | "groups" | "calls";

export type CommunityMessengerRoomType = "direct" | "private_group" | "open_group";
export type CommunityMessengerRoomStatus = "active" | "blocked" | "archived";
export type CommunityMessengerRoomVisibility = "private" | "public";
export type CommunityMessengerRoomJoinPolicy = "invite_only" | "password" | "free";
export type CommunityMessengerIdentityMode = "real_name" | "alias";
export type CommunityMessengerRoomIdentityPolicy = "real_name" | "alias_allowed";
export type CommunityMessengerMessageType = "text" | "image" | "file" | "system" | "call_stub" | "voice";
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

/** call_stub 의 callStatus 가 종료·취소·부재 등으로 통화가 끝난 상태인지 (세션 스냅샷과 교차 검증) */
export function communityMessengerCallStubStatusIsTerminal(
  status: CommunityMessengerCallStatus | null | undefined
): boolean {
  return status === "ended" || status === "cancelled" || status === "missed" || status === "rejected";
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
  /** `profiles.bio` — 한 줄 소개(나의 상태). 없으면 UI 에서 생략 */
  bio?: string | null;
  avatarUrl: string | null;
  memberRole?: "owner" | "admin" | "member";
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
  isHiddenFriend?: boolean;
  /** 친구 관계가 수락된 시각(최근 수락 기준). 친구 목록에서 「새 친구」 구간 정렬에 사용 */
  friendshipAcceptedAt?: string | null;
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

/** `rooms.summary` JSON — 거래/배달 목록 행용(선택). */
export type CommunityMessengerRoomContextMetaV1 = {
  v: 1;
  kind: "trade" | "delivery";
  headline?: string;
  priceLabel?: string;
  thumbnailUrl?: string | null;
  stepLabel?: string;
  /** 중고 거래채팅(`product_chats`)과 연결된 경우 */
  productChatId?: string;
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
  lastMessageType?: CommunityMessengerMessageType;
  lastMessageAt: string;
  memberCount: number;
  ownerUserId: string | null;
  ownerLabel: string;
  memberLimit: number | null;
  isDiscoverable: boolean;
  requiresPassword: boolean;
  allowMemberInvite: boolean;
  noticeText?: string;
  noticeUpdatedAt?: string | null;
  noticeUpdatedBy?: string | null;
  allowAdminInvite?: boolean;
  allowAdminKick?: boolean;
  allowAdminEditNotice?: boolean;
  allowMemberUpload?: boolean;
  allowMemberCall?: boolean;
  myIdentityMode?: CommunityMessengerIdentityMode;
  peerUserId?: string | null;
  /**
   * `community_messenger_participants.is_archived` — 내 목록에서만 숨김(보관함).
   * `roomStatus` 는 `community_messenger_rooms` 의 운영 상태(active/blocked/archived)만 반영한다.
   */
  isArchivedByViewer?: boolean;
  /** `summary` 필드가 v1 JSON 인 경우 파싱 결과(서버 조립 시 설정). */
  contextMeta?: CommunityMessengerRoomContextMetaV1 | null;
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
  /** call_stub metadata.sessionId — 방 스냅샷 activeCall 과 채팅 로그를 맞추는 데 사용 */
  callSessionId?: string | null;
  /** messageType === "voice" 일 때 재생 URL(보통 content 와 동일) */
  voiceDurationSeconds?: number | null;
  /** messageType === "voice" 일 때 0–1 막대 높이 (텔레그램 스타일 파형) */
  voiceWaveformPeaks?: number[] | null;
  /** 클라이언트 전용: 전송 대기(blob) 음성의 MIME — `<audio type>`·재생 호환용 */
  voiceMimeType?: string | null;
  /** messageType === "file" 일 때 첨부 파일 이름 */
  fileName?: string | null;
  /** messageType === "file" 일 때 MIME */
  fileMimeType?: string | null;
  /** messageType === "file" 일 때 바이트 */
  fileSizeBytes?: number | null;
};

export type CommunityMessengerRoomSnapshot = {
  viewerUserId: string;
  room: CommunityMessengerRoomSummary & {
    description?: string;
  };
  members: CommunityMessengerProfileLite[];
  /**
   * true: 전 참가자 프로필을 부트스트랩에 실지 않았음 — 멤버 시트·`/members` 페이지에서 로드.
   * (메시지 말풍선·헤더에 필요한 최소 프로필만 포함)
   */
  membersDeferred?: boolean;
  /** 그룹방에서 `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP` 초과 시 프로필 일부만 내려보냄 */
  membersTruncated?: boolean;
  messages: CommunityMessengerMessage[];
  myRole: "owner" | "admin" | "member";
  activeCall: CommunityMessengerCallSession | null;
  /**
   * `contextMeta.kind === "trade"` + `productChatId` 일 때 — `loadChatRoomDetailForUser`(entry) 로 조립.
   * 메신저 상단 거래 도크가 클라 `GET /api/chat/room/...` 를 다시 기다리지 않도록 RSC·부트스트랩 GET 과 동일 페이로드를 실음.
   */
  tradeChatRoomDetail?: ChatRoom | null;
};

/** `getCommunityMessengerRoomSnapshot` 초기 메시지 윈도 — 부트스트랩 API·가상 스크롤 `hasMore` 판단과 맞춤 */
export const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT = 30;

/** 그룹방 스냅샷에 실을 프로필(참가자) 상한 — 전원 하이드레이션 비용·응답 크기 완화 */
export const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP = 60;

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
  hidden: CommunityMessengerProfileLite[];
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
