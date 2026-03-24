/**
 * 당근형 거래+채팅+신고+후기+알림+제재 타입 (DB 스키마와 1:1 매핑)
 * - posts = product 개념 (post_id = product_id)
 */

/** 상품(게시글) 상태: sale=active */
export type ProductStatus = "sale" | "reserved" | "sold" | "hidden" | "deleted";

/** 채팅방 상태 */
export type ChatRoomStatus = "active" | "blocked" | "closed" | "report_hold";

/** 메시지 타입 */
export type ChatMessageType = "text" | "image" | "system";

/** 채팅방 (product_chats) */
export interface ChatRoomRow {
  id: string;
  product_id: string;
  seller_id: string;
  buyer_id: string;
  room_status: ChatRoomStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_seller: number;
  unread_count_buyer: number;
  created_at: string;
  updated_at: string;
}

/** 채팅 메시지 (product_chat_messages) */
export interface ChatMessageRow {
  id: string;
  product_chat_id: string;
  sender_id: string;
  message_type: ChatMessageType;
  content: string;
  image_url: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  read_at: string | null;
  created_at: string;
}

/** 신고 대상 */
export type ReportTargetType = "user" | "product" | "chat_room" | "chat_message";

/** 신고 상태 */
export type ReportStatus = "pending" | "reviewing" | "resolved" | "rejected" | "sanctioned";

/** reports 테이블 */
export interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  room_id: string | null;
  product_id: string | null;
  reason_code: string;
  reason_text: string | null;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** 관리자 처리 유형 */
export type ReportActionType =
  | "reject"
  | "warn"
  | "chat_ban"
  | "product_hide"
  | "account_suspend"
  | "account_ban";

/** report_actions 테이블 */
export interface ReportActionRow {
  id: string;
  report_id: string;
  action_type: ReportActionType;
  action_note: string | null;
  created_by: string;
  created_at: string;
}

/** 거래 후기 역할 */
export type ReviewRoleType = "seller_to_buyer" | "buyer_to_seller";

/** 공개 후기 등급 */
export type PublicReviewType = "good" | "normal" | "bad";

/** transaction_reviews 테이블 */
export interface TransactionReviewRow {
  id: string;
  product_id: string;
  room_id: string;
  reviewer_id: string;
  reviewee_id: string;
  role_type: ReviewRoleType;
  public_review_type: PublicReviewType;
  private_manner_score: number | null;
  private_tags: string[];
  is_anonymous_negative: boolean;
  created_at: string;
}

/** 알림 유형 */
export type NotificationType = "chat" | "status" | "review" | "report" | "system";

/** notifications 테이블 */
export interface NotificationRow {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

/** 제재 유형 */
export type SanctionType = "warning" | "chat_ban" | "temp_suspend" | "permanent_ban";

/** sanctions 테이블 */
export interface SanctionRow {
  id: string;
  user_id: string;
  sanction_type: SanctionType;
  start_at: string;
  end_at: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/** user_blocks (기존: user_id, blocked_user_id) */
export interface UserBlockRow {
  id: string;
  user_id: string;
  blocked_user_id: string;
  reason: string | null;
  created_at: string;
}
