"use client";

import { useCallback, useState } from "react";
import { useCategoryAdmin } from "./useCategoryAdmin";
import { CategoryTable } from "./CategoryTable";
import { CategoryFormModal } from "./CategoryFormModal";
import type { CategoryFormPayload, CategoryFormSettingsPayload } from "./CategoryFormModal";

export function AdminCategoriesPage() {
  const {
    list,
    loading,
    message,
    supabaseAvailable,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleMoveUp,
    handleMoveDown,
    handleToggleActive,
  } = useCategoryAdmin();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const editing = editingId ? list.find((c) => c.id === editingId) ?? null : null;

  const handleSaveEdit = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
      if (!editingId) return;
      await handleUpdate(editingId, payload, settings);
      setEditingId(null);
    },
    [editingId, handleUpdate]
  );

  const handleSaveCreate = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
      await handleCreate(payload, settings);
      setCreateOpen(false);
    },
    [handleCreate]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-sam-fg">카테고리 관리</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          카테고리 추가
        </button>
      </div>

      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <p className="font-medium">Supabase가 연결되지 않았습니다.</p>
          <p className="mt-1 text-amber-700">
            카테고리 저장·조회를 하려면 .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를
            설정한 뒤 개발 서버를 재시작해 주세요.
          </p>
        </div>
      )}

      {message && (
        <div
          className={`rounded-ui-rect px-4 py-2 text-[14px] ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      ) : (
        <CategoryTable
          items={list}
          onEdit={setEditingId}
          onDelete={(id) => void handleDelete(id)}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onToggleActive={handleToggleActive}
        />
      )}

      {editing && (
        <CategoryFormModal
          category={editing}
          onSave={handleSaveEdit}
          onDelete={() => {
            handleDelete(editing.id);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {createOpen && (
        <CategoryFormModal
          nextSortOrder={list.length}
          onSave={handleSaveCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
