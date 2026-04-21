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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-center sam-text-body text-sam-muted">
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
          className={`flex items-center gap-3 rounded-ui-rect border bg-sam-surface px-3 py-2 ${
            draggedId === c.id ? "opacity-50" : ""
          } ${overId === c.id ? "border-signature bg-signature/5" : "border-sam-border"}`}
        >
          <span className="cursor-grab text-sam-meta" aria-label="드래그">
            ⋮⋮
          </span>
          <span className="w-8 sam-text-body-secondary text-sam-muted">{c.sort_order + 1}</span>
          <span className="min-w-[100px] font-medium text-sam-fg">{c.name}</span>
          <span className="sam-text-body-secondary text-sam-muted">{c.slug}</span>
          <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-helper text-sam-muted">
            {CATEGORY_TYPE_LABELS[c.type]}
          </span>
          <button
            type="button"
            onClick={() => onToggleActive(c.id)}
            className={`rounded px-2 py-1 sam-text-helper font-medium ${
              c.is_active ? "bg-green-100 text-green-800" : "bg-sam-border-soft text-sam-muted"
            }`}
          >
            {c.is_active ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => onEdit(c.id)}
            className="ml-auto sam-text-body-secondary text-signature"
          >
            수정
          </button>
        </li>
      ))}
    </ul>
  );
}
