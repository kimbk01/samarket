"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useCallback, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type StoreMenuCategorySortableItem = {
  id: string;
  name: string;
  sort_order: number;
  description: string | null;
  is_hidden: boolean;
};

const categoryTitleClass =
  "truncate font-semibold leading-snug text-sam-fg [font-size:calc(var(--sam-text-body-size)-1px)]";
const categoryMetaClass =
  "leading-snug text-sam-muted [font-size:calc(var(--sam-text-helper-size)-1px)]";

/** 매장 카테고리 행 액션 — 키 컬러 #2386B1: 수정=진한 채움, 삭제=같은 색의 옅은 면+글자 */
const rowActionBase =
  "inline-flex min-h-9 shrink-0 items-center justify-center rounded-ui-rect px-2.5 py-1.5 text-[12px] font-semibold leading-none touch-manipulation select-none transition-[transform,opacity,background-color,border-color,filter] duration-150 active:scale-[0.96] disabled:opacity-45";

const rowEditBtnClass = `${rowActionBase} border border-[#2386B1] bg-[#2386B1] text-white shadow-sm hover:brightness-[1.06] active:brightness-95`;

const rowDeleteBtnClass = `${rowActionBase} border border-[#2386B1]/40 bg-[#2386B1]/12 text-[#2386B1] shadow-sm hover:border-[#2386B1]/55 hover:bg-[#2386B1]/20 active:bg-[#2386B1]/16`;

type SortableRowProps = {
  item: StoreMenuCategorySortableItem;
  orderIndex: number;
  reorderEnabled: boolean;
  disabled: boolean;
  onEdit: (s: StoreMenuCategorySortableItem) => void;
  onDelete: (s: StoreMenuCategorySortableItem) => void;
};

const SortableCategoryRow = memo(function SortableCategoryRow({
  item,
  orderIndex,
  reorderEnabled,
  disabled,
  onEdit,
  onDelete,
}: SortableRowProps) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !reorderEnabled || disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  } as const;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-2 rounded-ui-rect border bg-sam-surface p-3 shadow-sm ${
        isDragging
          ? "border-signature/60 shadow-lg ring-2 ring-signature/25"
          : "border-sam-border"
      } ${disabled ? "opacity-70" : ""}`}
    >
      {reorderEnabled ? (
        <div
          {...listeners}
          {...attributes}
          style={{ touchAction: "none" }}
          aria-label={t("business_phase7_482", { v1: item.name })}
          className={`flex shrink-0 flex-col justify-center gap-1.5 rounded-ui-rect border border-transparent bg-transparent px-1.5 py-2 text-sam-muted outline-none hover:border-sam-border-soft hover:bg-sam-surface-muted ${
            disabled ? "cursor-not-allowed opacity-45" : "cursor-grab touch-none active:cursor-grabbing"
          }`}
        >
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
        </div>
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 flex-1 cursor-default select-none py-0.5 text-left">
          <p className={categoryTitleClass}>{item.name}</p>
          <p className={categoryMetaClass}>
            {t("business_phase7_483", { v1: String(orderIndex) })}
            {item.is_hidden ? (
              <span className="ml-2 rounded bg-sam-border-soft px-1.5 py-0.5 text-sam-fg [font-size:calc(var(--sam-text-helper-size)-1px)]">
                {t("business_phase7_418")}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onEdit(item)} className={rowEditBtnClass}>
            {t("common_edit")}
          </button>
          <button type="button" onClick={() => onDelete(item)} className={rowDeleteBtnClass}>
            {t("common_delete")}
          </button>
        </div>
      </div>
    </li>
  );
});

function StaticCategoryRow({
  item,
  orderIndex,
  onEdit,
  onDelete,
}: {
  item: StoreMenuCategorySortableItem;
  orderIndex: number;
  onEdit: (s: StoreMenuCategorySortableItem) => void;
  onDelete: (s: StoreMenuCategorySortableItem) => void;
}) {
  const { t } = useI18n();
  return (
    <li className="relative flex items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
      <span className="w-8 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 flex-1 cursor-default select-none py-0.5 text-left">
          <p className={categoryTitleClass}>{item.name}</p>
          <p className={categoryMetaClass}>
            {t("business_phase7_483", { v1: String(orderIndex) })}
            {item.is_hidden ? (
              <span className="ml-2 rounded bg-sam-border-soft px-1.5 py-0.5 text-sam-fg [font-size:calc(var(--sam-text-helper-size)-1px)]">
                {t("business_phase7_418")}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onEdit(item)} className={rowEditBtnClass}>
            {t("common_edit")}
          </button>
          <button type="button" onClick={() => onDelete(item)} className={rowDeleteBtnClass}>
            {t("common_delete")}
          </button>
        </div>
      </div>
    </li>
  );
}

export type StoreMenuCategorySortableListProps = {
  items: StoreMenuCategorySortableItem[];
  disabled?: boolean;
  /** 드래그 종료 후 화면 순서가 이미 갱신된 배열(sort_order 0..n-1)을 서버에 반영 */
  onCommitOrder: (next: StoreMenuCategorySortableItem[]) => Promise<void>;
  onEdit: (s: StoreMenuCategorySortableItem) => void;
  onDelete: (s: StoreMenuCategorySortableItem) => void;
};

export function StoreMenuCategorySortableList({
  items,
  disabled = false,
  onCommitOrder,
  onEdit,
  onDelete,
}: StoreMenuCategorySortableListProps) {
  const reorderEnabled = items.length >= 2;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const ids = useMemo(() => items.map((x) => x.id), [items]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((x) => x.id === String(active.id));
      const newIndex = items.findIndex((x) => x.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const moved = arrayMove(items, oldIndex, newIndex).map((s, i) => ({ ...s, sort_order: i }));
      void onCommitOrder(moved);
    },
    [items, onCommitOrder]
  );

  if (!reorderEnabled) {
    return (
      <ul className={`space-y-2 ${disabled ? "pointer-events-none opacity-70" : ""}`}>
        {items.map((item, orderIndex) => (
          <StaticCategoryRow key={item.id} item={item} orderIndex={orderIndex} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={`space-y-2 ${disabled ? "pointer-events-none opacity-70" : ""}`}>
          {items.map((item, orderIndex) => (
            <SortableCategoryRow
              key={item.id}
              item={item}
              orderIndex={orderIndex}
              reorderEnabled
              disabled={disabled}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
