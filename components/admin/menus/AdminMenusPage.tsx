"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useCategoryAdmin } from "@/components/admin/categories/useCategoryAdmin";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MenuManagementTable } from "./MenuManagementTable";
import { CategorySubtopicsModal } from "./CategorySubtopicsModal";
import { CategoryFormModal } from "@/components/admin/categories/CategoryFormModal";
import type { CategoryFormPayload, CategoryFormSettingsPayload } from "@/components/admin/categories/CategoryFormModal";
import { updateCategory } from "@/lib/categories/updateCategory";
import { swapCategorySortOrders } from "@/lib/categories/swapCategorySortOrder";
import { notifyMainBottomNavConfigChanged } from "@/lib/app/fetch-main-bottom-nav-deduped";
import {
  ConsoleButton,
  SectionHeader,
} from "@/components/admin/trade-console/trade-console-ui";

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

/** 메뉴 관리 (거래) — `/admin/menus/trade` */
export function AdminMenusPage() {
  const { t } = useI18n();
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
    () => list.filter((c) => c.type === "trade" && c.parent_id == null),
    [list]
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subtopicParentId, setSubtopicParentId] = useState<string | null>(null);
  const editing = editingId ? list.find((c) => c.id === editingId) ?? null : null;
  const subtopicParent = subtopicParentId ? list.find((c) => c.id === subtopicParentId) ?? null : null;
  const nextSortOrder = menuRows.length;

  /** 거래 메뉴 변경 시: 고아 `/market/…` 탭을 DB에서 제거한 뒤 하단 탭 재조회 */
  const syncTradeMenuToStoredBottomNav = useCallback(async () => {
    await requestPruneOrphanMarketBottomNav();
    notifyMainBottomNavConfigChanged();
  }, []);

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
        showSuccess(!current ? t("admin_menu_launcher_on") : t("admin_menu_launcher_off"));
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [load, showSuccess, syncTradeMenuToStoredBottomNav, t]
  );

  const handleMoveUp = useCallback(
    async (id: string) => {
      const idx = menuRows.findIndex((c) => c.id === id);
      if (idx <= 0) return;
      const res = await swapCategorySortOrders(menuRows[idx], menuRows[idx - 1]);
      if (res.ok) {
        showSuccess(t("admin_cat_msg_reordered"));
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [menuRows, load, showSuccess, syncTradeMenuToStoredBottomNav, t]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const idx = menuRows.findIndex((c) => c.id === id);
      if (idx === -1 || idx >= menuRows.length - 1) return;
      const res = await swapCategorySortOrders(menuRows[idx], menuRows[idx + 1]);
      if (res.ok) {
        showSuccess(t("admin_cat_msg_reordered"));
        load();
        void syncTradeMenuToStoredBottomNav();
      }
    },
    [menuRows, load, showSuccess, syncTradeMenuToStoredBottomNav, t]
  );

  return (
    <div className="space-y-4" data-admin>
      <SectionHeader
        title={t("admin_menu_trade_mgmt_title")}
        description={t("admin_menu_trade_mgmt_subtitle")}
        actions={
          <ConsoleButton variant="primary" onClick={() => setCreateOpen(true)}>
            {t("admin_cat_menu_add")}
          </ConsoleButton>
        }
      />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_menu_trade_sync_p1")}{" "}
        <span className="font-mono sam-text-helper text-sam-fg">/market/…</span>
        {t("admin_menu_trade_sync_p2")}
        <span className="font-mono sam-text-helper"> /philife</span>
        {t("admin_menu_trade_sync_p3")}{" "}
        <Link href="/admin/menus/main-bottom-nav" className="font-medium text-signature hover:underline">
          {t("admin_menu_main_bottom_nav")}
        </Link>
        {t("admin_menu_trade_sync_p4")}
      </p>

      <div className="flex items-center justify-between">
        <span className="sam-text-body text-sam-muted">{t("admin_menu_trade_items_heading")}</span>
      </div>

      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-800">
          <p className="font-medium">{t("admin_cat_supabase_title")}</p>
          <p className="mt-1 text-amber-700">{t("admin_cat_supabase_body")}</p>
        </div>
      )}

      {message && (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : (
        <MenuManagementTable
          items={menuRows}
          allCategories={list}
          tradeSubtopicsEnabled
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
          forceType="trade"
          nextSortOrder={nextSortOrder}
          onSave={handleSaveCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editing && (
        <CategoryFormModal
          mode="menu"
          forceType="trade"
          category={editing}
          onSave={handleSaveEdit}
          onDelete={async () => {
            if (!(await dibayConfirm({ title: t("admin_cat_confirm_delete"), confirmTone: "destructive" }))) return;
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