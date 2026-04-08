"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t, tt } = useI18n();
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
        title={t("admin_menu_chat_trade")}
      >
        {ROOM_TYPE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {tt(o.label)}
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
            {tt(o.label)}
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
        {t("admin_chat_reported_only")}
      </label>
      <input
        type="text"
        placeholder={t("admin_chat_search_placeholder")}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="min-w-[200px] rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
      />
    </div>
  );
}
