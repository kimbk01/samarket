"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
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
    <DibayOverlayRoot open onClose={onClose} dismissible placement="center" zRole="nested">
      <div
        className={`${OverlayUi.dialogPanel} !max-w-2xl max-h-[90vh] overflow-y-auto p-4`}
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
    </DibayOverlayRoot>
  );
}
