"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { TradeSubtopicsPanel } from "./TradeSubtopicsPanel";

interface CategorySubtopicsModalProps {
  parent: CategoryWithSettings;
  allCategories: CategoryWithSettings[];
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function CategorySubtopicsModal({
  parent,
  allCategories,
  onClose,
  onRefresh,
  onDelete,
}: CategorySubtopicsModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative z-[101] max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <TradeSubtopicsPanel
          parent={parent}
          allCategories={allCategories}
          onRefresh={onRefresh}
          onDelete={onDelete}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
