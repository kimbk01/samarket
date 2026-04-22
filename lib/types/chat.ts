import type { PostListPreviewModel } from "@/lib/posts/post-list-preview-model";

/**
 * 6단계: 채팅 타입 (Supabase Realtime 연동 시 교체용)
 *
 * 당근형 정렬:
 * - source "product_chat" = 레거시 product_chats 테이블
 * - source "chat_room" = chat_rooms (item_trade 또는 general_chat)
 * - roomStatus: active | blocked | closed | report_hold (UI/목록용)
 */

export interface CurrentUser {
  id: string;
  nickname: string;
}

export interface ChatProductSummary {
  id: string;
  title: string;
  /** 거래 글 `/post/[id]`, 필라이프 글 `/philife/[id]` 등 상세 경로 */
  detailHref?: string;
  thumbnail: string;
  price: number;
  /** 글 작성자 표시명 (채팅 목록 「작성자」) */
  authorNickname?: string;
  /** posts.status — 숨김/판매완료 등 글 상태 */
  status: string;
  /** posts.seller_listing_state — 판매중/문의중/예약중/판매완료 (목록·채팅·어드민 공통) */
  sellerListingState?: string;
  /** 거래 희망 지역 등 (당근형 상단 카드) */
  regionLabel?: string;
  /** 상대시간 표시용 (posts.updated_at 등 ISO) */
  updatedAt?: string;
  /** 환전 글 — 피드 PostCard와 동일(₱·환율 줄) */
  isExchangePost?: boolean;
  /** 환전: 표시용 페소 금액(null이면 「금액 문의」) */
  exchangePhpAmount?: number | null;
  /** 환전: 「1 PHP = …」 한 줄, 없으면 환율 미지정 톤 */
  exchangeRateSubLine?: string | null;
  /** 피드 PostCard 본문과 동일(판매 글 전 종류) */
  listPreview?: PostListPreviewModel | null;
  /** meta.trade_chat_kind === "job" — 채팅방 한정 전화 노출 API 사용 */
  isJobTradeChat?: boolean;
  /** `posts.meta.trade_chat_call_policy` — 거래 채팅 통화(메신저) 허용 범위 */
  tradeChatCallPolicy?: "none" | "voice_only" | "voice_and_video";
}

export type ChatRoomStatus = "active" | "blocked" | "closed" | "report_hold";

/** 당근형: 목록/상세에서 어느 백엔드 사용 중인지 (메시지·전송·읽음 API 분기용) */
export type ChatRoomSource = "product_chat" | "chat_room";

/** 일반(목적형) 채팅 메타 — 거래 UI·상태 API와 분리 */
export interface GeneralChatMeta {
  kind: "community" | "group" | "open_chat" | "business" | "legacy_general" | "store_order";
  relatedPostId?: string | null;
  relatedCommentId?: string | null;
  relatedGroupId?: string | null;
  relatedBusinessId?: string | null;
  /** room_type=store_order 일 때 매장 주문 id */
  storeOrderId?: string | null;
  /** room_type=store_order 일 때 매장 id (오너 API 경로용) */
  storeId?: string | null;
  contextType?: string | null;
}

/** UI/API 분기용 — `inferMessengerDomainFromChatRoom` 과 함께 사용 */
export type ChatDomain =
  | "trade"
  | "philife"
  | "store"
  | "community"
  | "store_order";

export interface PhilifeChatMeta {
  kind: "meeting" | "direct" | "open_chat";
  meetingId?: string | null;
  hostUserId?: string | null;
  relatedPostId?: string | null;
  memberCount?: number;
  joined?: boolean;
  canSend?: boolean;
}

export interface ChatRoomActiveNotice {
  id: string;
  title: string;
  body: string;
  visibility: "members" | "public";
  isPinned?: boolean;
  createdAt: string;
}

export type TradeFlowStatus =
  | "chatting"
  | "seller_marked_done"
  | "buyer_confirmed"
  | "review_pending"
  | "review_completed"
  | "dispute"
  | "cancelled"
  | "archived";

export type TradeChatMode = "open" | "limited" | "readonly";

export interface ChatRoom {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  partnerNickname: string;
  partnerAvatar: string;
  /** 상대 profiles 기준 신뢰·거래 온도 배터리(0~100). trade/store 방 조회 시 설정 */
  partnerTrustScore?: number;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  product: ChatProductSummary;
  /** 당근형: room_status */
  roomStatus?: ChatRoomStatus;
  /** 당근형: product_chats vs chat_rooms — 메시지/전송/읽음/나가기 API 분기 */
  source?: ChatRoomSource;
  /** 당근형 거래 채팅: inquiry | negotiating | reserved | completed | cancelled | dispute */
  tradeStatus?: string;
  /** product_chats URL인데 연결된 chat_rooms가 있을 때 — 거래 상태 API만 이 ID 사용 */
  chatRoomId?: string;
  /** 거래/후기 API·후기 저장에 사용 — 없으면 id(product_chats)로 간주 */
  productChatRoomId?: string | null;
  /** 거래↔메신저 직통방 UUID — 있으면 통화 브리지 API 생략 가능 */
  communityMessengerRoomId?: string | null;
  tradeFlowStatus?: TradeFlowStatus | string;
  chatMode?: TradeChatMode | string;
  /** posts.sold_buyer_id */
  soldBuyerId?: string | null;
  /** posts.reserved_buyer_id — 예약중일 때 확정 구매자 */
  reservedBuyerId?: string | null;
  /** 구매자 본인 기준 buyer→seller 후기 제출 여부 (GET /api/chat/room) */
  buyerReviewSubmitted?: boolean;
  /** 거래완료 확인 주체: user | admin | system */
  buyerConfirmSource?: string | null;
  /** 일반(커뮤니티/모임/비즈) 채팅이면 설정 — 있으면 거래 전용 UI 비활성화 */
  generalChat?: GeneralChatMeta | null;
  /** trade / 필라이프 / 매장 채팅 도메인 식별 */
  chatDomain?: ChatDomain;
  /** 도메인 전용 제목 — 없으면 partnerNickname 사용 */
  roomTitle?: string;
  /** 도메인 전용 보조 문구 */
  roomSubtitle?: string;
  /** 필라이프 전용 메타 */
  philifeChat?: PhilifeChatMeta | null;
  /** 오픈채팅 현재 공지 */
  activeNotice?: ChatRoomActiveNotice | null;
  /** 그룹 채팅 등 참여 인원 */
  memberCount?: number;
  /** 현재 사용자 기준 전송 가능 여부 */
  canSend?: boolean;
  /** 현재 사용자 기준 오픈채팅 운영 권한 */
  canManage?: boolean;
  /** 관리자 조치(차단·보관 잠금 등)로 거래 채팅 전송 불가 — GET /api/chat/room */
  adminChatSuspended?: boolean;
}

export type ChatMessageType = "text" | "image" | "system";

/** 메신저 스타일: 특정 메시지에 대한 답장 시 원문 참조 (연결 가능 구조) */
export interface ChatMessageReplyTo {
  id: string;
  text: string;
  senderId: string;
}

/** 메신저 스타일: 메시지 리액션 (연결 가능 구조) */
export interface ChatMessageReaction {
  emoji: string;
  userId: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderNickname?: string | null;
  message: string;
  messageType?: ChatMessageType;
  imageUrl?: string | null;
  /** 통합 채팅 metadata·묶음 전송 시 여러 장 */
  imageUrls?: string[] | null;
  isHidden?: boolean;
  hiddenReason?: string | null;
  readAt?: string | null;
  createdAt: string;
  isRead: boolean;
  /** 답장 대상 메시지 (metadata 등에서 확장 시 사용) */
  replyTo?: ChatMessageReplyTo | null;
  /** 리액션 목록 (metadata 등에서 확장 시 사용) */
  reactions?: ChatMessageReaction[];
}
