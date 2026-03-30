/**
 * 15단계: 관리자 채팅 필터·검색·정렬 (실제 DB/API와 연동)
 */

import type { AdminChatRoom, RoomStatus, AdminRoomType } from "@/lib/types/admin-chat";

export type { RoomStatus, AdminRoomType };

export const ROOM_STATUS_OPTIONS: { value: RoomStatus | ""; label: string }[] = [
  { value: "", label: "전체 상태" },
  { value: "active", label: "활성" },
  { value: "blocked", label: "차단" },
  { value: "reported", label: "신고됨" },
  { value: "archived", label: "보관" },
];

export const ROOM_TYPE_OPTIONS: { value: AdminRoomType; label: string }[] = [
  { value: "", label: "전체 타입" },
  { value: "item_trade", label: "TRADE 채팅" },
  { value: "general_chat", label: "일반(레거시)" },
  { value: "community", label: "커뮤니티" },
  { value: "group", label: "모임·게시판" },
  { value: "business", label: "비즈·상점" },
];

export interface AdminChatFilters {
  roomStatus: RoomStatus | "";
  roomType: AdminRoomType;
  contextType?: string;
  reportedOnly: boolean;
  sortKey: "lastMessage";
}

export function filterAndSortChatRooms(
  rooms: AdminChatRoom[],
  filters: AdminChatFilters,
  searchQuery: string
): AdminChatRoom[] {
  let list = [...rooms];

  if (filters.roomType) {
    list = list.filter((r) => r.roomType === filters.roomType);
  }
  if (filters.contextType) {
    list = list.filter((r) => r.contextType === filters.contextType);
  }
  if (filters.roomStatus) {
    list = list.filter((r) => r.roomStatus === filters.roomStatus);
  }
  if (filters.reportedOnly) {
    list = list.filter((r) => r.reportCount > 0);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter((r) => {
      const matchProduct = r.productTitle.toLowerCase().includes(q);
      const matchBuyer = r.buyerNickname.toLowerCase().includes(q);
      const matchSeller = r.sellerNickname.toLowerCase().includes(q);
      const matchId = r.id.toLowerCase().includes(q);
      return matchProduct || matchBuyer || matchSeller || matchId;
    });
  }

  list.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
  return list;
}
