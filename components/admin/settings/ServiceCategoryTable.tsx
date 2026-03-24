"use client";

import type { ServiceCategory } from "@/lib/types/admin-category";

interface ServiceCategoryTableProps {
  items: ServiceCategory[];
  onToggleActive: (id: string) => void;
  onEdit: (id: string) => void;
}

export function ServiceCategoryTable({ items, onToggleActive, onEdit }: ServiceCategoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 py-8 text-center text-[14px] text-gray-500">
        상단 서비스 카테고리가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 text-left font-medium text-gray-700">순서</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">이름</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">slug</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">아이콘</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">노출</th>
            <th className="px-3 py-2 text-right font-medium text-gray-700">수정</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className="border-b border-gray-100">
              <td className="px-3 py-2 text-gray-600">{row.sort_order + 1}</td>
              <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
              <td className="px-3 py-2 text-gray-600">{row.slug}</td>
              <td className="px-3 py-2 text-gray-600">{row.icon_key}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onToggleActive(row.id)}
                  className={`rounded px-2 py-1 text-[12px] font-medium ${
                    row.is_active
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {row.is_active ? "ON" : "OFF"}
                </button>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(row.id)}
                  className="text-[13px] text-gray-600 hover:text-gray-900"
                >
                  수정
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
