"use client";

import { useCallback, useState } from "react";
import type { CategoryWithSettings } from "@/lib/types/category";
import { CATEGORY_TYPE_LABELS } from "@/lib/types/category";

interface CategoryDragListProps {
  items: CategoryWithSettings[];
  onReorder: (orderedIds: string[]) => void;
  onToggleActive: (id: string) => void;
  onEdit: (id: string) => void;
}

export function CategoryDragList({
  items,
  onReorder,
  onToggleActive,
  onEdit,
}: CategoryDragListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, overId: string) => {
      e.preventDefault();
      setOverId(null);
      setDraggedId(null);
      const id = e.dataTransfer.getData("text/plain");
      if (!id || id === overId) return;
      const idx = items.findIndex((c) => c.id === id);
      const overIdx = items.findIndex((c) => c.id === overId);
      if (idx === -1 || overIdx === -1) return;
      const next = items.slice();
      const [removed] = next.splice(idx, 1);
      next.splice(overIdx, 0, removed);
      onReorder(next.map((c) => c.id));
    },
    [items, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setOverId(null);
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-[14px] text-gray-500">
        등록된 카테고리가 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {items.map((c) => (
        <li
          key={c.id}
          draggable
          onDragStart={(e) => handleDragStart(e, c.id)}
          onDragOver={(e) => handleDragOver(e, c.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, c.id)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 ${
            draggedId === c.id ? "opacity-50" : ""
          } ${overId === c.id ? "border-signature bg-signature/5" : "border-gray-200"}`}
        >
          <span className="cursor-grab text-gray-400" aria-label="드래그">
            ⋮⋮
          </span>
          <span className="w-8 text-[13px] text-gray-500">{c.sort_order + 1}</span>
          <span className="min-w-[100px] font-medium text-gray-900">{c.name}</span>
          <span className="text-[13px] text-gray-500">{c.slug}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-600">
            {CATEGORY_TYPE_LABELS[c.type]}
          </span>
          <button
            type="button"
            onClick={() => onToggleActive(c.id)}
            className={`rounded px-2 py-1 text-[12px] font-medium ${
              c.is_active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
            }`}
          >
            {c.is_active ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => onEdit(c.id)}
            className="ml-auto text-[13px] text-signature"
          >
            수정
          </button>
        </li>
      ))}
    </ul>
  );
}
