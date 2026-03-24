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
}

export type ChatRoomStatus = "active" | "blocked" | "closed" | "report_hold";

/** 당근형: 목록/상세에서 어느 백엔드 사용 중인지 (메시지·전송·읽음 API 분기용) */
export type ChatRoomSource = "product_chat" | "chat_room";

/** 일반(목적형) 채팅 메타 — 거래 UI·상태 API와 분리 */
export interface GeneralChatMeta {
  kind: "community" | "group" | "business" | "legacy_general" | "store_order";
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
  message: string;
  messageType?: ChatMessageType;
  imageUrl?: string | null;
  isHidden?: boolean;
  readAt?: string | null;
  createdAt: string;
  isRead: boolean;
  /** 답장 대상 메시지 (metadata 등에서 확장 시 사용) */
  replyTo?: ChatMessageReplyTo | null;
  /** 리액션 목록 (metadata 등에서 확장 시 사용) */
  reactions?: ChatMessageReaction[];
}
