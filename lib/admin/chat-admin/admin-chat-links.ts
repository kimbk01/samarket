/**
 * 채팅 Admin 링크 SSOT — 방 상세 · 회원 상세 · 신고 큐 (모두 `returnTo` 보존).
 * Client-safe pure module.
 */

import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import {
  adminCmRoomDetailHref,
  adminTradeChatDetailHref,
} from "@/lib/admin-community-messenger/room-domain-links";

/** 채팅 신고 단일 큐 (O-C10). */
export const ADMIN_CHAT_REPORT_QUEUE_PATH = "/admin/chats/reported" as const;

/** CM 방 상세 — 일반 1:1 · 그룹 · 거래 · 배달 주문 공통 (`community_messenger_rooms.id`). */
export function adminChatRoomDetailHref(roomId: string, returnTo?: string | null): string {
  return adminCmRoomDetailHref(roomId, returnTo);
}

/** 레거시 거래 채팅 상세 (`chat_rooms` / `product_chats` id). */
export function adminLegacyTradeChatDetailHref(roomId: string, returnTo?: string | null): string {
  return adminTradeChatDetailHref(roomId, returnTo);
}

export function adminUserDetailHref(userId: string, returnTo?: string | null): string {
  return withAdminReturnTo(`/admin/users/${encodeURIComponent(userId)}`, returnTo);
}

/** 회원의 참여 채팅방 목록 (서버 `user_id` 참여자 필터). */
export function adminChatRoomsForUserHref(userId: string): string {
  return `/admin/chats?user_id=${encodeURIComponent(userId)}`;
}
