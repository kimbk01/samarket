"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useCategoryAdmin } from "@/components/admin/categories/useCategoryAdmin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { MenuManagementTable } from "./MenuManagementTable";
import { CategorySubtopicsModal } from "./CategorySubtopicsModal";
import { CategoryFormModal } from "@/components/admin/categories/CategoryFormModal";
import type { CategoryFormPayload, CategoryFormSettingsPayload } from "@/components/admin/categories/CategoryFormModal";
import { updateCategory } from "@/lib/categories/updateCategory";
import { swapCategorySortOrders } from "@/lib/categories/swapCategorySortOrder";
import { notifyMainBottomNavConfigChanged } from "@/lib/app/fetch-main-bottom-nav-deduped";

export type MenuFormType = "trade" | "community";

async function requestPruneOrphanMarketBottomNav(): Promise<void> {
  try {
    await fetch("/api/admin/main-bottom-nav/prune-orphan-market", {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    /* 네트워크 실패 시에도 클라 캐시 무효화는 아래에서 수행 */
  }
}

/**
 * 메뉴 관리 — `/admin/menus/trade` | `/admin/menus/philife` 에서 각각 호출
 */
export function AdminMenusPage({ menuType }: { menuType: MenuFormType }) {
  const {
    list,
    loading,
    message,
    supabaseAvailable,
    load,
    handleCreate,
    handleUpdate,
    handleDelete,
    showSuccess,
  } = useCategoryAdmin();

  const menuRows = useMemo(
    () => list.filter((c) => c.type === menuType && c.parent_id == null),
    [list, menuType]
  );

  const title = menuType === "trade" ? "메뉴 관리 (거래)" : "메뉴 관리 (커뮤니티)";
  const subtitle =
    menuType === "trade"
      ? "거래 종류(일반·중고차·부동산·알바·환전 등)를 관리합니다. 항목을 추가하면 기본으로 홈 상단 칩과 플로팅 글쓰기(+ 메뉴) 주제 목록에 함께 들어갑니다. 런처에서만 빼려면 표의 「글쓰기 런처」를 끄거나, 수정 화면에서 「런처에 표시」를 해제하세요. 「주제」로 2행 칩을 만들 수 있습니다."
      : "커뮤니티·동네생활 메뉴를 관리합니다. 항목을 추가하면 기본으로 플로팅 글쓰기 런처 주제에도 포함됩니다. 목록에서만 빼려면 「글쓰기 런처」를 끄거나 수정에서 「런처에 표시」를 해제하세요.";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subtopicParentId, setSubtopicParentId] = useState<string | null>(null);
  const editing = editingId ? list.find((c) => c.id === editingId) ?? null : null;
  const subtopicParent = subtopicParentId ? list.find((c) => c.id === subtopicParentId) ?? null : null;
  const nextSortOrder = menuRows.length;

  /** 거래 메뉴 변경 시: 고아 `/market/…` 탭을 DB에서 제거한 뒤 하단 탭 재조회 */
  const syncTradeMenuToStoredBottomNav = useCallback(async () => {
    if (menuType !== "trade") return;
    await requestPruneOrphanMarketBottomNav();
    notifyMainBottomNavConfigChanged();
  }, [menuType]);

  const handleSaveEdit = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
      if (!editingId) return;
      const ok = await handleUpdate(editingId, payload, settings);
      if (ok) {
        setEditingId(null);
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [editingId, handleUpdate, syncTradeMenuToStoredBottomNav]
  );

  const handleSaveCreate = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
      const ok = await handleCreate(payload, settings);
      if (ok) {
        setCreateOpen(false);
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [handleCreate, syncTradeMenuToStoredBottomNav]
  );

  const handleDeleteWithBottomNav = useCallback(
    async (id: string) => {
      const ok = await handleDelete(id);
      if (ok) void syncTradeMenuToStoredBottomNav();
    },
    [handleDelete, syncTradeMenuToStoredBottomNav]
  );

  const refreshMenusAndBottomNav = useCallback(async () => {
    await load();
    void syncTradeMenuToStoredBottomNav();
  }, [load, syncTradeMenuToStoredBottomNav]);

  const toggleAndRefresh = useCallback(
    async (id: string, current: boolean) => {
      const res = await updateCategory(id, { show_in_home_chips: !current });
      if (res.ok) {
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [load, syncTradeMenuToStoredBottomNav]
  );

  const toggleQuickLauncher = useCallback(
    async (id: string, current: boolean) => {
      const res = await updateCategory(id, { quick_create_enabled: !current });
      if (res.ok) {
        showSuccess(!current ? "글쓰기 런처에 표시합니다." : "글쓰기 런처에서 뺐습니다.");
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [load, showSuccess, syncTradeMenuToStoredBottomNav]
  );

  const handleMoveUp = useCallback(
    async (id: string) => {
      const idx = menuRows.findIndex((c) => c.id === id);
      if (idx <= 0) return;
      const res = await swapCategorySortOrders(menuRows[idx], menuRows[idx - 1]);
      if (res.ok) {
        showSuccess("순서가 변경되었습니다.");
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [menuRows, load, showSuccess, syncTradeMenuToStoredBottomNav]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const idx = menuRows.findIndex((c) => c.id === id);
      if (idx === -1 || idx >= menuRows.length - 1) return;
      const res = await swapCategorySortOrders(menuRows[idx], menuRows[idx + 1]);
      if (res.ok) {
        showSuccess("순서가 변경되었습니다.");
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [menuRows, load, showSuccess, syncTradeMenuToStoredBottomNav]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title={title} />
      <p className="text-[14px] text-sam-muted">{subtitle}</p>
      {menuType === "trade" ? (
        <p className="text-[13px] text-sam-muted">
          앱 하단 탭에서 경로를 <span className="font-mono text-[12px] text-sam-fg">/market/…</span> 로 둔 항목은
          여기 거래 메뉴와 연동됩니다(이름 변경·삭제 시 탭 라벨 제거 또는 고아 탭 정리).
          <span className="font-mono text-[12px]"> /home</span> 등 다른 경로만 쓰는 탭은 이 목록과 자동 동기화되지 않으니{" "}
          <Link href="/admin/menus/main-bottom-nav" className="font-medium text-signature hover:underline">
            메인 하단 탭 메뉴
          </Link>
          에서 직접 조정하세요.
        </p>
      ) : null}
      {menuType === "community" ? (
        <p className="text-[13px] text-sam-muted">
          커뮤니티 <strong className="font-medium text-sam-fg">게시판 목록</strong>(자유게시판 등)은{" "}
          <Link href="/admin/boards" className="font-medium text-signature hover:underline">
            게시판 관리
          </Link>
          에서 만들고, 여기서는 글쓰기로 연결되는 <strong className="font-medium text-sam-fg">메뉴·카테고리</strong>를 다룹니다.
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-sam-muted">
          {menuType === "trade" ? "거래 종류 항목" : "커뮤니티 메뉴 항목"}
        </span>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90"
        >
          항목 추가
        </button>
      </div>

      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <p className="font-medium">Supabase가 연결되지 않았습니다.</p>
          <p className="mt-1 text-amber-700">
            저장·조회를 하려면 .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작해 주세요.
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
        <MenuManagementTable
          items={menuRows}
          allCategories={menuType === "trade" ? list : undefined}
          tradeSubtopicsEnabled={menuType === "trade"}
          onToggleShowOnMenu={toggleAndRefresh}
          onToggleQuickLauncher={toggleQuickLauncher}
          onEdit={setEditingId}
          onDelete={handleDeleteWithBottomNav}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onManageSubtopics={(c) => setSubtopicParentId(c.id)}
        />
      )}

      {createOpen && (
        <CategoryFormModal
          mode="menu"
          forceType={menuType}
          nextSortOrder={nextSortOrder}
          onSave={handleSaveCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editing && (
        <CategoryFormModal
          mode="menu"
          forceType={menuType}
          category={editing}
          onSave={handleSaveEdit}
          onDelete={async () => {
            if (!confirm("삭제하시겠습니까?")) return;
            const ok = await handleDelete(editing.id);
            if (ok) void syncTradeMenuToStoredBottomNav();
            if (ok) setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {subtopicParent && (
        <CategorySubtopicsModal
          parent={subtopicParent}
          allCategories={list}
          onClose={() => setSubtopicParentId(null)}
          onRefresh={refreshMenusAndBottomNav}
          onDelete={handleDeleteWithBottomNav}
        />
      )}
    </div>
  );
}
