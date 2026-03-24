/**
 * 15단계: 관리자 채팅관리 타입 (6단계 ChatRoom/ChatMessage와 호환)
 */

export type RoomStatus = "active" | "blocked" | "reported" | "archived";

/** 거래·레거시 일반·목적형 일반(community/group/business) */
export type AdminRoomType =
  | "item_trade"
  | "general_chat"
  | "community"
  | "group"
  | "business"
  | "";

export interface AdminChatRoom {
  id: string;
  productId: string;
  productTitle: string;
  productThumbnail: string;
  buyerId: string;
  buyerNickname: string;
  sellerId: string;
  sellerNickname: string;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
  reportCount: number;
  roomStatus: RoomStatus;
  createdAt: string;
  adminMemo?: string;
  /** 미읽음: 판매자/구매자 (관리자 목록용) */
  unreadSeller?: number;
  unreadBuyer?: number;
  /** 거래 채팅 / 일반 채팅 — 어드민 필터·웹와 동일 구분 */
  roomType?: AdminRoomType;
  /** 일반 채팅일 때 업체(biz_profile) 등 — 업체채팅 필터용 */
  contextType?: string;
  /** 관리자 읽기 전용(메시지 전송 차단) */
  isReadonly?: boolean;
  /** 관리자 일괄 삭제 시 DB 테이블 구분 (통합 chat_rooms vs 레거시 product_chats) */
  adminChatStorage?: "chat_rooms" | "product_chats";
}

export type AdminChatMessageType = "text" | "image" | "system";

export interface AdminChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  messageType: AdminChatMessageType;
  message: string;
  createdAt: string;
  isReported?: boolean;
  isHidden?: boolean;
}

export type ChatModerationActionType =
  | "warn"
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "hide_message"
  | "review_only";

export interface ChatModerationLog {
  id: string;
  roomId: string;
  /** UI 라벨은 AdminChatModerationLogList.ACTION_LABELS — DB action_type 포함 */
  actionType: string;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}
