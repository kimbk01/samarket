"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser } from "@/lib/types/admin-user";
import {
  AUTH_PROVIDER_OPTIONS,
  MODERATION_STATUS_OPTIONS,
  MEMBER_TYPE_OPTIONS,
  PHONE_VERIFIED_OPTIONS,
  SORT_OPTIONS,
  type AdminUserFilters,
  type AdminUserSortKey,
  type AdminUserSortOrder,
} from "@/lib/admin-users/admin-user-utils";

interface AdminUserFilterBarProps {
  filters: AdminUserFilters;
  searchQuery: string;
  onFiltersChange: (f: AdminUserFilters) => void;
  onSearchChange: (q: string) => void;
  /** false면 검색 placeholder에서 UUID 안내 생략 (표시 설정과 맞춤) */
  showMemberUuid?: boolean;
  onShowMemberUuidChange?: (show: boolean) => void;
  onSortChange?: (key: AdminUserSortKey) => void;
  onSortOrderChange?: (order: AdminUserSortOrder) => void;
}

export function AdminUserFilterBar({
  filters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
  showMemberUuid = false,
  onShowMemberUuidChange,
  onSortChange,
  onSortOrderChange,
}: AdminUserFilterBarProps) {
  const { tt, t } = useI18n();
  const searchPlaceholder = showMemberUuid
    ? t("admin_search_member_with_uuid")
    : t("admin_search_member");

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto rounded-xl border border-[#d0d7e2] bg-white p-3 font-sans shadow-sm [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="min-w-[240px] max-w-[min(100%,340px)] shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-medium text-[#101828] outline-none placeholder:text-[#667085] focus:border-[#1877f2] focus:bg-white"
      />
      <select
        value={filters.authProvider}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            authProvider: e.target.value as AdminUserFilters["authProvider"],
          })
        }
        className="shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828] outline-none focus:border-[#1877f2] focus:bg-white"
      >
        {AUTH_PROVIDER_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
      <select
        value={filters.phoneVerified}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            phoneVerified: e.target.value as AdminUserFilters["phoneVerified"],
          })
        }
        className="shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828] outline-none focus:border-[#1877f2] focus:bg-white"
      >
        {PHONE_VERIFIED_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
      <select
        value={filters.moderationStatus}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            moderationStatus: e.target.value as AdminUserFilters["moderationStatus"],
          })
        }
        className="shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828] outline-none focus:border-[#1877f2] focus:bg-white"
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
        className="shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828] outline-none focus:border-[#1877f2] focus:bg-white"
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
        className="min-w-[130px] shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-medium text-[#101828] outline-none placeholder:text-[#667085] focus:border-[#1877f2] focus:bg-white"
      />
      {onShowMemberUuidChange ? (
        <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828]">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-[#dadde1] text-[#1877f2] focus:ring-[#1877f2]"
            checked={showMemberUuid}
            onChange={(e) => onShowMemberUuidChange(e.target.checked)}
          />
          회원 UUID 표시
        </label>
      ) : null}
      <select
        value={filters.sortKey}
        onChange={(e) =>
          onSortChange
            ? onSortChange(e.target.value as AdminUserSortKey)
            : onFiltersChange({
                ...filters,
                sortKey: e.target.value as AdminUserSortKey,
              })
        }
        className="shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828] outline-none focus:border-[#1877f2] focus:bg-white"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {tt(o.label)}
          </option>
        ))}
      </select>
      <select
        value={filters.sortOrder}
        onChange={(e) =>
          onSortOrderChange
            ? onSortOrderChange(e.target.value as AdminUserSortOrder)
            : onFiltersChange({
                ...filters,
                sortOrder: e.target.value as AdminUserSortOrder,
              })
        }
        className="shrink-0 rounded-lg border border-[#d0d7e2] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#101828] outline-none focus:border-[#1877f2] focus:bg-white"
      >
        <option value="desc">내림차순</option>
        <option value="asc">오름차순</option>
      </select>
    </div>
  );
}
