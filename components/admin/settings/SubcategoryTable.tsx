"use client";

import type { ServiceSubcategory } from "@/lib/types/admin-category";
import type { ServiceCategory } from "@/lib/types/admin-category";

interface SubcategoryTableProps {
  items: ServiceSubcategory[];
  parents: ServiceCategory[];
  parentFilterId: string;
  onParentFilterChange: (parentId: string) => void;
  onToggleActive: (id: string) => void;
  onEdit: (id: string) => void;
}

export function SubcategoryTable({
  items,
  parents,
  parentFilterId,
  onParentFilterChange,
  onToggleActive,
  onEdit,
}: SubcategoryTableProps) {
  const parentName = (id: string) => parents.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body-secondary font-medium text-sam-fg">상위 카테고리</label>
        <select
          value={parentFilterId}
          onChange={(e) => onParentFilterChange(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body text-sam-fg"
        >
          <option value="">전체</option>
          {parents.filter((p) => p.is_active).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {items.length === 0 ? (
        <div className="rounded border border-sam-border bg-sam-app py-8 text-center sam-text-body text-sam-muted">
          하위 카테고리가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2 text-left font-medium text-sam-fg">상위</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">이름</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">slug</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">정렬</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">노출</th>
                <th className="px-3 py-2 text-right font-medium text-sam-fg">수정</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 text-sam-muted">{parentName(row.parent_id)}</td>
                  <td className="px-3 py-2 font-medium text-sam-fg">{row.name}</td>
                  <td className="px-3 py-2 text-sam-muted">{row.slug}</td>
                  <td className="px-3 py-2 text-sam-muted">{row.sort_order + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onToggleActive(row.id)}
                      className={`rounded px-2 py-1 sam-text-helper font-medium ${
                        row.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-sam-border-soft text-sam-muted"
                      }`}
                    >
                      {row.is_active ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(row.id)}
                      className="sam-text-body-secondary text-sam-muted hover:text-sam-fg"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
