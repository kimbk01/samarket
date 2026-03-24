"use client";

import {
  ROOM_STATUS_OPTIONS,
  ROOM_TYPE_OPTIONS,
  type AdminChatFilters,
  type RoomStatus,
  type AdminRoomType,
} from "@/lib/admin-chats/admin-chat-utils";

interface AdminChatFilterBarProps {
  filters: AdminChatFilters;
  searchQuery: string;
  onFiltersChange: (f: AdminChatFilters) => void;
  onSearchChange: (q: string) => void;
}

export function AdminChatFilterBar({
  filters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
}: AdminChatFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filters.roomType}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            roomType: e.target.value as AdminRoomType,
          })
        }
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
        title="거래 채팅 = 상품 채팅하기, 일반 채팅 = 프로필/이웃 등"
      >
        {ROOM_TYPE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.roomStatus}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            roomStatus: e.target.value as RoomStatus | "",
          })
        }
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
      >
        {ROOM_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-2 text-[14px] text-gray-700">
        <input
          type="checkbox"
          checked={filters.reportedOnly}
          onChange={(e) =>
            onFiltersChange({ ...filters, reportedOnly: e.target.checked })
          }
          className="rounded border-gray-300"
        />
        신고 있음
      </label>
      <input
        type="text"
        placeholder="상품명·참여자·채팅방 ID 검색"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="min-w-[200px] rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
      />
    </div>
  );
}
