"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { CategoryTypeBadge } from "./CategoryTypeBadge";
import { CategoryStatusBadge } from "./CategoryStatusBadge";

interface CategoryTableProps {
  items: CategoryWithSettings[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onToggleActive: (id: string) => void;
}

export function CategoryTable({
  items,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleActive,
}: CategoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        등록된 카테고리가 없습니다. 새 카테고리를 추가해 주세요.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[800px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 text-left font-medium text-gray-700">순서</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">카테고리명</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">slug</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">아이콘</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">타입</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">사용여부</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">글쓰기</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">가격</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">채팅</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">위치</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">post_type</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">런처</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">런처그룹</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">런처순서</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">상단칩</th>
            <th className="px-3 py-2 text-right font-medium text-gray-700">관리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, index) => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50">
              <td className="px-3 py-2 text-gray-600">{c.sort_order + 1}</td>
              <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
              <td className="px-3 py-2 text-[12px] text-gray-600">{c.slug}</td>
              <td className="px-3 py-2 text-gray-600">{c.icon_key}</td>
              <td className="px-3 py-2">
                <CategoryTypeBadge type={c.type} />
              </td>
              <td className="px-3 py-2">
                <CategoryStatusBadge isActive={c.is_active} />
              </td>
              <td className="px-3 py-2 text-center">{c.settings?.can_write ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center">{c.settings?.has_price ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center">{c.settings?.has_chat ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center">{c.settings?.has_location ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-[12px] text-gray-600">{c.settings?.post_type ?? "—"}</td>
              <td className="px-3 py-2 text-center">{c.quick_create_enabled ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center text-[12px] text-gray-600">{c.quick_create_group ?? "—"}</td>
              <td className="px-3 py-2 text-center text-[12px] text-gray-600">{c.quick_create_order}</td>
              <td className="px-3 py-2 text-center">{c.show_in_home_chips !== false ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveUp(c.id)}
                    disabled={index === 0}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-40"
                    title="위로"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(c.id)}
                    disabled={index === items.length - 1}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-40"
                    title="아래로"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(c.id)}
                    className="rounded px-1.5 py-0.5 text-[12px] text-gray-600 hover:bg-gray-200"
                  >
                    {c.is_active ? "OFF" : "ON"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(c.id)}
                    className="rounded px-1.5 py-0.5 text-[12px] text-signature hover:bg-signature/10"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="rounded px-1.5 py-0.5 text-[12px] text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
