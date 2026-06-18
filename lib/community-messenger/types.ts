import type { ChatRoom } from "@/lib/types/chat";
import type { DirectCallDenyCode } from "@/lib/community-messenger/direct-call-permission";

export type CommunityMessengerTab = "friends" | "chats" | "groups" | "calls";

export type CommunityMessengerRoomType = "direct" | "private_group" | "open_group";
export type CommunityMessengerRoomStatus = "active" | "blocked" | "archived";
export type CommunityMessengerRoomVisibility = "private" | "public";
export type CommunityMessengerRoomJoinPolicy = "invite_only" | "password" | "free";
export type CommunityMessengerIdentityMode = "real_name" | "alias";
export type CommunityMessengerRoomIdentityPolicy = "real_name" | "alias_allowed";
export type CommunityMessengerMessageType = "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker" | "community_post_share";
export type CommunityMessengerCallKind = "voice" | "video";
export type CommunityMessengerPresenceState = "online" | "away" | "offline";
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
  /** 배달: 배송/결제 단계 등 */
  stepLabel?: string;
  /** 거래: 내 역할(구매자/판매자) */
  roleLabel?: string;
  /** 거래: 상품 상태(판매중/예약중/거래완료/숨김/삭제됨) */
  itemStateLabel?: string;
  /** 거래: 목록 1행 — `/admin/menus/trade` 홈칩과 정합한 대메뉴 라벨(거래 탭 리스트 칩은 이 값만 사용) */
  categoryMenuLabel?: string;
  /** 거래: leaf 표시명 — 방 헤더·기타와 정합. 리스트 1행 칩은 `categoryMenuLabel` 단일 소스 */
  productCategoryLabel?: string;
  /** 중고 거래채팅(`product_chats`)과 연결된 경우 */
  productChatId?: string;
  /** `posts.id` — 목록에서 `posts` Realtime으로 `itemStateLabel` 동기화용 */
  postId?: string;
  /** 목록 4행 — `product_chats.seller_id` 우선, 없으면 `posts.user_id` 작성자 표시명(프로필 라벨). UI에서 「판매자:」/「작성자:」 접두만 붙인다. */
  sellerDisplayName?: string;
  /** Mirrors `product_chats.trade_flow_status` for list/header sync. */
  tradeFlowStatus?: string;
  /** 배달·매장 주문 채팅(`store_order`)의 원본 주문 id */
  storeOrderId?: string;
  /** 배달·매장 주문 번호 — 목록/헤더 보조 표시 */
  orderNo?: string;
  /** 배달·매장 주문의 매장 id */
  storeId?: string;
  /** 목록 행 — 매장명(피어 닉네임·id 대신 표시) */
  storeDisplayName?: string;
  /** `store_orders.fulfillment_type` 스냅샷 */
  fulfillmentType?: string;
  /** 배달·주문 채팅 음성 메시지 허용 스냅샷 */
  storeVoiceMessagesEnabled?: boolean;
  /** 배달·주문 채팅 음성 통화 허용 스냅샷 */
  storeVoiceCallsEnabled?: boolean;
  /** 배달·주문 채팅 영상 통화 허용 스냅샷 */
  storeVideoCallsEnabled?: boolean;
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
   * `community_messenger_rooms.direct_key` — 거래 스레드(`trade_pc:`·`trade_item:`)·주문(`trade_order:`) 등
   * 목록 pillar 분류에 사용(`summary` JSON 파싱 실패 시에도 동일 키로 거래 탭에 포함).
   */
  messengerDirectKey?: string | null;
  /**
   * `community_messenger_participants.is_archived` — 내 목록에서만 숨김(보관함).
   * `roomStatus` 는 `community_messenger_rooms` 의 운영 상태(active/blocked/archived)만 반영한다.
   */
  isArchivedByViewer?: boolean;
  /** `community_messenger_participants.blocked_hidden_at` — 차단 시 내 채팅 목록에서 숨김. */
  isBlockedHiddenByViewer?: boolean;
  /** `summary` 필드가 v1 JSON 인 경우 파싱 결과(서버 조립 시 설정). */
  contextMeta?: CommunityMessengerRoomContextMetaV1 | null;
  /** `meetings.community_messenger_room_id` 연동 모임 방: 내 `meeting_members` 역할 표시(목록 뱃지) */
  philifeMeetingMemberLabel?: "host" | "member" | null;
};

/** 메인 대화 목록·「보관됨」필터 — 운영상 폐쇄(방 archived) 또는 개인 보관 */
export function communityMessengerRoomIsInboxHidden(
  room: Pick<CommunityMessengerRoomSummary, "roomStatus" | "isArchivedByViewer">
): boolean {
  return room.roomStatus === "archived" || Boolean(room.isArchivedByViewer);
}

/** 차단으로 viewer participant 가 숨긴 direct room — 보관함과 분리, 메인 목록 제외 */
export function communityMessengerRoomIsBlockedHiddenByViewer(
  room: Pick<CommunityMessengerRoomSummary, "isBlockedHiddenByViewer">
): boolean {
  return Boolean(room.isBlockedHiddenByViewer);
}

/** 메인 채팅 인박스에 표시할 room 인지 (보관·차단 숨김 제외) */
export function communityMessengerRoomIsVisibleInMainChatInbox(
  room: Pick<CommunityMessengerRoomSummary, "roomStatus" | "isArchivedByViewer" | "isBlockedHiddenByViewer">
): boolean {
  if (communityMessengerRoomIsBlockedHiddenByViewer(room)) return false;
  if (communityMessengerRoomIsInboxHidden(room)) return false;
  return true;
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
  meetingId?: string | null;
  regionText?: string | null;
  categoryText?: string | null;
  platformApprovalStatus?: string | null;
};

export type CommunityMessengerMessage = {
  id: string;
  roomId: string;
  senderId: string | null;
  senderLabel: string;
  messageType: CommunityMessengerMessageType;
  content: string;
  createdAt: string;
  /** DB `community_messenger_messages.metadata` — system 요약·이미지·통화 등 */
  metadata?: Record<string, unknown> | null;
  /** 클라이언트 idempotency 키(전송 중복 방지/ACK 정합성). 서버는 metadata.client_message_id 로 저장 */
  clientMessageId?: string | null;
  isMine: boolean;
  /** 낙관적 전송 등 — 정책 모듈에서 `pending === true` 이면 일부 액션 비활성 */
  pending?: boolean;
  callKind?: CommunityMessengerCallKind | null;
  callStatus?: CommunityMessengerCallStatus | null;
  /** call_stub metadata.sessionId — 방 스냅샷 activeCall 과 채팅 로그를 맞추는 데 사용 */
  callSessionId?: string | null;
  /** call_stub metadata.tmpSessionId — 다이얼 tmp_* 매칭 */
  callTmpSessionId?: string | null;
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
  /**
   * messageType === "image" 이고 한 말풍선에 여러 장(앨범)일 때 — `metadata.image_urls` 와 동일 순서.
   * 2장 이상일 때만 채움(단일 이미지는 `content` URL 만 사용).
   */
  imageAlbumUrls?: string[] | null;
  /** 앨범: 확대 라이트박스용 URL (`metadata.image_preview_urls`, 없으면 썸네일·원본 순으로 대체). */
  imageAlbumPreviewUrls?: string[] | null;
  /** 앨범: 공유·복사용 원본 URL (`metadata.image_urls`). */
  imageAlbumOriginalUrls?: string[] | null;
  /** 단일 이미지: 확대용 URL (`metadata.image_preview_url`). */
  imagePreviewUrl?: string | null;
  /** 단일 이미지: 원본 URL (`metadata.image_original_url`). */
  imageOriginalUrl?: string | null;
  /** 답장 대상 메시지 id — 서버 `reply_to_message_id` */
  replyToMessageId?: string | null;
  replyPreviewText?: string | null;
  replyPreviewType?: CommunityMessengerMessageType | string | null;
  replySenderLabelSnapshot?: string | null;
  /** 전원 삭제 시각(ISO) — 있으면 본문은 placeholder 로만 표시 */
  deletedForEveryoneAt?: string | null;
  /** 그룹에서만 count>1 의미가 큼; 직접방은 mine 토글 위주 */
  reactions?: Array<{ reactionKey: string; count: number; mine: boolean }>;
};

/** 롱프레스 메뉴(앵커) — `DOMRectReadOnly` 를 직렬화한 값 */
export type CommunityMessengerMessageActionAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type CommunityMessengerMessageActionOpenState = {
  item: CommunityMessengerMessage & { pending?: boolean };
  anchorRect: CommunityMessengerMessageActionAnchorRect;
};

/** `POST .../images` → `sendCommunityMessengerImageMessage` 전달 형식 */
export type CommunityMessengerImageSendItem = {
  chatPublicUrl: string;
  previewPublicUrl: string;
  originalPublicUrl: string;
  originalStoragePath: string;
  originalMimeType: string;
};

export type CommunityMessengerReadReceipt = {
  roomId: string;
  readerUserId: string;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
  /**
   * 상대 `last_read_message_id` 행의 `created_at` — 부트스트랩 메시지 창에 커서 id 가 없어도
   * 내 발화 대비 읽음 여부를 `(created_at,id)` 순으로 판정하기 위해 포함한다.
   */
  lastReadMessageCreatedAt?: string | null;
};

export type CommunityMessengerPeerPresenceSnapshot = {
  userId: string;
  state: CommunityMessengerPresenceState;
  lastSeenAt: string | null;
};

/** 거래 CM 방 — `product_chats` 나가기·판매자 종료와 메시지 전송 가능 여부 (스냅샷 단일 진실) */
export type CommunityMessengerTradeMessagingSnapshot = {
  productChat: {
    sellerId: string;
    buyerId: string;
    sellerLeftAt: string | null;
    buyerLeftAt: string | null;
  } | null;
  canSendMessage: boolean;
  denyCode: string | null;
  denyMessage: string | null;
};

export type CommunityMessengerRoomSnapshot = {
  /** 클라이언트만 — HTTP 부트스트랩 전 셸·입력창용 가짜 스냅샷(실제 데이터 도착 시 교체) */
  clientShellPlaceholder?: true;
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
  /**
   * RSC/부트스트랩 1차 페이로드에서 통화·거래 도크·presence·레거시 unread 보강 등을 생략했을 때 —
   * 클라가 idle 에 전체 스냅샷으로 사일런트 보강해야 함(`useMessengerRoomBootstrapLifecycle`).
   */
  bootstrapEnrichmentPending?: boolean;
  messages: CommunityMessengerMessage[];
  /**
   * 이 응답을 만들 때 최근 메시지 SQL `limit`에 쓴 값 — `hasMoreOlderMessages` 보조·구형 클라 폴백.
   * 부트스트랩 시드(기본 `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT`)와 `GET ...?messages=` 커스텀 모두 포함.
   */
  bootstrapInitialMessageLimit?: number;
  /**
   * DB에 타임라인상 더 오래된(이 스냅샷 최상단보다 이전) 메시지가 있을 가능성.
   * `fetch limit`만큼 행을 채워 받았을 때 true(정확히 limit개면 다음 `before` 페이지 시도 가능).
   */
  hasMoreOlderMessages?: boolean;
  myRole: "owner" | "admin" | "member";
  readReceipt?: CommunityMessengerReadReceipt | null;
  peerPresence?: CommunityMessengerPeerPresenceSnapshot | null;
  activeCall: CommunityMessengerCallSession | null;
  /**
   * `contextMeta.kind === "trade"` + `productChatId` 일 때 — `loadChatRoomDetailForUser`(entry) 로 조립.
   * 메신저 상단 거래 도크가 클라 `GET /api/chat/room/...` 를 다시 기다리지 않도록 RSC·부트스트랩 GET 과 동일 페이로드를 실음.
   */
  tradeChatRoomDetail?: ChatRoom | null;
  /** `product_chats` 와 연결된 거래 스레드 전송 가드 — 컴포저·전송 API와 동일 규칙 */
  tradeMessaging?: CommunityMessengerTradeMessagingSnapshot | null;
  /**
   * 1:1 general direct — viewer 가 unknown peer 상단 안내 바를 dismiss 했는지.
   * `user_social_relations` 와 분리(`community_messenger_peer_notices`).
   */
  unknownPeerNoticeDismissed?: boolean;
  /** 1:1 general direct — peer 와의 friendship SSOT 상태(스냅샷·통화 UI) */
  peerFriendshipState?: "accepted" | "pending" | "none" | "blocked";
  /** viewer → peer 발신 통화 gate — hidden room 과 무관 */
  directCallGate?: {
    canStartVoice: boolean;
    canStartVideo: boolean;
    denyCode?: DirectCallDenyCode;
  };
};

/** `getCommunityMessengerRoomSnapshot` 초기 메시지 윈도 — 부트스트랩 API·가상 스크롤 `hasMore` 판단과 맞춤 */
export const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT = 30;

/** 비-expand 부트스트랩 시드 기본 — 첫 페인트용 최근 메시지 슬라이스(~24). 라우트 `effectiveDefaultLimit`·critical clamp와 맞춘다. */
export const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT = 24;

/** 그룹방 스냅샷에 실을 프로필(참가자) 상한 — 전원 하이드레이션 비용·응답 크기 완화 */
export const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP = 60;

/** `listCommunityMessengerCallLogs` UI용 최종 분류 — 서버에서 계산 */
export type CommunityMessengerCallLogDisplayType =
  | "missed_outgoing"
  | "missed_incoming"
  | "rejected"
  | "cancelled"
  | "failed"
  | "outgoing"
  | "incoming";

export type CommunityMessengerCallLog = {
  id: string;
  /** community_messenger_call_logs.session_id — 통화 상세 딥링크용 */
  sessionId: string | null;
  roomId: string | null;
  sessionMode: CommunityMessengerCallSessionMode;
  title: string;
  peerLabel: string;
  /** 1:1 상대 공개 아이디(`@` 제외) — `닉네임 (@아이디)` 표기용 */
  peerPublicId?: string | null;
  /** 1:1 상대·그룹방 아바타 — 통화 목록 행 썸네일 */
  peerAvatarUrl: string | null;
  peerUserId: string | null;
  participantCount: number;
  participantLabels: string[];
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  startedAt: string;
  durationSeconds: number;
  /** call_logs.ended_at 우선, 없으면 세션 ended_at */
  endedAt: string | null;
  /** call_logs.caller_user_id === 나 */
  isOutgoing: boolean;
  /** community_messenger_call_sessions.ended_reason */
  endedReason: string | null;
  displayType: CommunityMessengerCallLogDisplayType;
};

export type CommunityMessengerCallSession = {
  id: string;
  roomId: string;
  sessionMode: CommunityMessengerCallSessionMode;
  initiatorUserId: string;
  recipientUserId: string | null;
  peerUserId: string | null;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  /** DB `ended_reason` — 클라 연결 실패 등 계약 문자열 */
  endedReason?: string | null;
  isMineInitiator: boolean;
  participants: CommunityMessengerCallParticipant[];
  /** `invite_preview`: 브로드캐스트만으로 만든 최소 세션 — 터미널 시 반드시 제거 */
  source?: "invite_preview" | string;
  isPreview?: boolean;
  /** 발신 측 tmp 세션 id와 수신 측 id 연결(선택) */
  tmpSessionId?: string | null;
  cancelledAt?: string | null;
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

/** `GET /api/community-messenger/bootstrap?tier=critical` — 리스트 첫 페인트용 최소 페이로드 */
export type CommunityMessengerCriticalParticipantLabel = {
  user_id: string;
  label: string;
  avatar_url: string | null;
};

export type CommunityMessengerCriticalRoomRow = {
  room_id: string;
  room_type: CommunityMessengerRoomType;
  direct_key: string | null;
  title: string;
  avatar_url: string | null;
  /** 예약 필드 — 현재는 서버가 항상 `avatar_url` 중심 */
  avatar_ref: string | null;
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
  participant_labels_minimal: CommunityMessengerCriticalParticipantLabel[];
  group_meta: {
    member_count: number;
    member_limit: number | null;
    is_discoverable: boolean;
    join_policy: CommunityMessengerRoomJoinPolicy;
  } | null;
};

export type CommunityMessengerBootstrapCritical = {
  tier: "critical";
  me: CommunityMessengerProfileLite | null;
  chats: CommunityMessengerCriticalRoomRow[];
  groups: CommunityMessengerCriticalRoomRow[];
  tabs: { chats: number; groups: number };
};

export type CommunityMessengerBootstrap = {
  /** 클라 스테이징(critical-first) — 서버 계약 필드 아님 */
  clientHydrationTier?: "critical" | "full";
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
  /**
   * true면 통화 기록은 아직 비어 있으며, 클라가 `GET /api/community-messenger/bootstrap?callsLog=1` 로
   * 백그라운드 병합한다(첫 페인트·TTFB 절감).
   */
  deferredCallLog?: boolean;
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
