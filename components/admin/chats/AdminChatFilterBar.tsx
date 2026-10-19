"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ROOM_STATUS_OPTIONS,
  type AdminChatFilters,
  type RoomStatus,
} from "@/lib/admin-chats/admin-chat-utils";

interface AdminChatFilterBarProps {
  filters: AdminChatFilters;
  searchQuery: string;
  onFiltersChange: (f: AdminChatFilters) => void;
  onSearchChange: (q: string) => void;
}

/**
 * 거래 채팅 목록 필터 — 상태 · 신고 · 검색 (URL 상태는 상위 화면이 소유).
 * C-10: 거래 화면에 의미 없던 「채팅 타입」 선택(레거시 커뮤니티·모임·비즈 값)은 제거.
 */
export function AdminChatFilterBar({
  filters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
}: AdminChatFilterBarProps) {
  const { t, tt } = useI18n();
  const [draft, setDraft] = useState(searchQuery);
  useEffect(() => {
    setDraft(searchQuery);
  }, [searchQuery]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearchChange(draft);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" data-admin-list-filters="trade-chats">
      <select
        value={filters.roomStatus}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            roomStatus: e.target.value as RoomStatus | "",
          })
        }
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {ROOM_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-2 sam-text-body text-sam-fg">
        <input
          type="checkbox"
          checked={filters.reportedOnly}
          onChange={(e) => onFiltersChange({ ...filters, reportedOnly: e.target.checked })}
          className="rounded border-sam-border"
        />
        {t("admin_chat_reported_only")}
      </label>
      <input
        type="text"
        placeholder={t("admin_chat_search_placeholder")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
      />
      <button
        type="submit"
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
      >
        {tt("검색")}
      </button>
    </form>
  );
}
