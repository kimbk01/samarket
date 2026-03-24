/**
 * 주문 채팅 UI 진입점 — Supabase Realtime/DB 연동 시 이 모듈만 서버 액션으로 교체하기 쉽습니다.
 */
export {
  ensureOrderChatRoom,
  findOrderChatRoomByOrderId,
  getOrderChatUnreadForMember,
  getOrderChatUnreadForOwner,
  listMessagesForOrder,
  listOrderChatRooms,
  listOrderChatRoomsForBuyer,
  listOrderChatRoomsForOwner,
  markOrderChatReadAsAdmin,
  markOrderChatReadAsMember,
  markOrderChatReadAsOwner,
  resetSharedOrderChat,
  sendOrderChatFromAdmin,
  sendOrderChatTextFromMember,
  sendOrderChatTextFromOwner,
  setOrderChatRoomStatus,
  setOrderChatMessagingBlocked,
  isOrderChatMessagingBlocked,
} from "./shared-chat-store";

export { subscribeOrderChat, getOrderChatVersion } from "./shared-chat-store";
