"use client";

import type { AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";
import {
  CATEGORY_OPTIONS,
  RESULT_OPTIONS,
  type AdminAuditFilters,
  type AuditSortKey,
} from "@/lib/admin-audit/admin-audit-utils";

interface AdminAuditFilterBarProps {
  filters: AdminAuditFilters;
  onFiltersChange: (f: AdminAuditFilters) => void;
}

export function AdminAuditFilterBar({
  filters,
  onFiltersChange,
}: AdminAuditFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="관리자·대상 ID·제목·actionType 검색"
        value={filters.searchQuery}
        onChange={(e) =>
          onFiltersChange({ ...filters, searchQuery: e.target.value })
        }
        className="min-w-[200px] rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
      />
      <select
        value={filters.category}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            category: e.target.value as AuditLogCategory | "",
          })
        }
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
      >
        {CATEGORY_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="관리자 닉네임"
        value={filters.adminNickname}
        onChange={(e) =>
          onFiltersChange({ ...filters, adminNickname: e.target.value })
        }
        className="min-w-[120px] rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
      />
      <select
        value={filters.result}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            result: e.target.value as AuditLogResult | "",
          })
        }
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
      >
        {RESULT_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.sortKey}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            sortKey: e.target.value as AuditSortKey,
          })
        }
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
      >
        <option value="newest">최신순</option>
        <option value="oldest">오래된순</option>
      </select>
    </div>
  );
}
