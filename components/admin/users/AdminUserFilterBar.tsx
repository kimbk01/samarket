"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser } from "@/lib/types/admin-user";
import {
  MODERATION_STATUS_OPTIONS,
  MEMBER_TYPE_OPTIONS,
  SORT_OPTIONS,
  type AdminUserFilters,
  type AdminUserSortKey,
} from "@/lib/admin-users/admin-user-utils";

interface AdminUserFilterBarProps {
  filters: AdminUserFilters;
  searchQuery: string;
  onFiltersChange: (f: AdminUserFilters) => void;
  onSearchChange: (q: string) => void;
  /** false면 검색 placeholder에서 UUID 안내 생략 (표시 설정과 맞춤) */
  showMemberUuid?: boolean;
  onShowMemberUuidChange?: (show: boolean) => void;
}

export function AdminUserFilterBar({
  filters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
  showMemberUuid = false,
  onShowMemberUuidChange,
}: AdminUserFilterBarProps) {
  const { tt, t } = useI18n();
  const searchPlaceholder = showMemberUuid
    ? t("admin_search_member_with_uuid")
    : t("admin_search_member");

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="min-w-[180px] max-w-[min(100%,280px)] shrink-0 rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
      />
      <select
        value={filters.moderationStatus}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            moderationStatus: e.target.value as AdminUserFilters["moderationStatus"],
          })
        }
        className="shrink-0 rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {MODERATION_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
      <select
        value={filters.memberType}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            memberType: e.target.value as AdminUser["memberType"] | "",
          })
        }
        className="shrink-0 rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {MEMBER_TYPE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder={t("common_region")}
        value={filters.location}
        onChange={(e) => onFiltersChange({ ...filters, location: e.target.value })}
        className="min-w-[100px] shrink-0 rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
      />
      {onShowMemberUuidChange ? (
        <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg shadow-sm">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-sam-border text-signature focus:ring-signature"
            checked={showMemberUuid}
            onChange={(e) => onShowMemberUuidChange(e.target.checked)}
          />
          회원 UUID 표시
        </label>
      ) : null}
      <select
        value={filters.sortKey}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            sortKey: e.target.value as AdminUserSortKey,
          })
        }
        className="shrink-0 rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
    </div>
  );
}
