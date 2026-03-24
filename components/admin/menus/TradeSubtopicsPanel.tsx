"use client";

import { useCallback, useMemo, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { swapCategorySortOrders } from "@/lib/categories/swapCategorySortOrder";
import { CategorySubtopicFormModal } from "./CategorySubtopicFormModal";

interface TradeSubtopicsPanelProps {
  parent: CategoryWithSettings;
  allCategories: CategoryWithSettings[];
  onRefresh: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  /** 모달 상단 닫기 (페이지 모드에서는 생략) */
  onClose?: () => void;
}

/** 홈·마켓 2행 주제 CRUD — 메뉴 모달·전용 어드민 페이지에서 공유 */
export function TradeSubtopicsPanel({
  parent,
  allCategories,
  onRefresh,
  onDelete,
  onClose,
}: TradeSubtopicsPanelProps) {
  const siblings = useMemo(
    () =>
      allCategories
        .filter((c) => c.parent_id === parent.id)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [allCategories, parent.id]
  );

  const nextSortOrder = siblings.length;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? siblings.find((c) => c.id === editingId) ?? null : null;

  const refresh = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const handleMoveUp = useCallback(
    async (id: string) => {
      const idx = siblings.findIndex((c) => c.id === id);
      if (idx <= 0) return;
      const res = await swapCategorySortOrders(siblings[idx], siblings[idx - 1]);
      if (res.ok) await refresh();
    },
    [siblings, refresh]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const idx = siblings.findIndex((c) => c.id === id);
      if (idx === -1 || idx >= siblings.length - 1) return;
      const res = await swapCategorySortOrders(siblings[idx], siblings[idx + 1]);
      if (res.ok) await refresh();
    },
    [siblings, refresh]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold text-gray-900">
            {onClose ? "주제(하위) 관리" : `「${parent.name}」 주제`}
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            이 메뉴를 탭했을 때 홈·마켓 상단 2행 칩·글쓰기 주제로 쓰입니다. 주제가 없으면 2행은 표시되지 않습니다.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[14px] text-gray-500 hover:bg-gray-100"
            aria-label="닫기"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-signature px-3 py-1.5 text-[13px] font-medium text-white hover:bg-signature/90"
        >
          주제 추가
        </button>
      </div>

      {siblings.length === 0 ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-[14px] text-gray-500">
            아래에서 주제를 추가하면 목록이 여기 표시됩니다. 사용자 화면에서는 주제가 없으면 2행 칩이 나타나지 않습니다.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <strong className="font-medium">주제를 저장했는데도 목록·표에 안 보이면</strong> Supabase <code className="rounded bg-amber-100 px-1">categories</code> 테이블에{" "}
            <code className="rounded bg-amber-100 px-1">parent_id</code> 컬럼이 있는지 확인하세요. 없으면 SQL Editor에서 마이그레이션(
            <code className="rounded bg-amber-100 px-1">ALTER TABLE … ADD parent_id</code>)을 실행해야 합니다.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-700">순서</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">이름</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">slug</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">상태</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">관리</th>
              </tr>
            </thead>
            <tbody>
              {siblings.map((c, index) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-600">{c.sort_order}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                  <td className="px-3 py-2 text-[12px] text-gray-600">{c.slug}</td>
                  <td className="px-3 py-2 text-[13px] text-gray-600">{c.is_active ? "사용" : "비활성"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(c.id)}
                        disabled={index === 0}
                        className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-40"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(c.id)}
                        disabled={index === siblings.length - 1}
                        className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-40"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(c.id)}
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
      )}

      {createOpen && (
        <CategorySubtopicFormModal
          parent={parent}
          nextSortOrder={nextSortOrder}
          onDone={() => void refresh()}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editing && (
        <CategorySubtopicFormModal
          parent={parent}
          category={editing}
          nextSortOrder={nextSortOrder}
          onDone={() => {
            setEditingId(null);
            void refresh();
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
