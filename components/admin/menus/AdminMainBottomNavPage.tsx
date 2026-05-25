"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  resolveAdminBottomNavApiError,
} from "@/components/admin/i18n/admin-menus-label-keys";
import {
  MainBottomNavIconPickerModal,
  MainBottomNavIconPickerTrigger,
} from "@/components/admin/menus/MainBottomNavIconPickerModal";
import { openBottomNavHref } from "@/lib/main-menu/bottom-nav-link-open";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";
import {
  applyMainBottomNavIconPatch,
  cloneMainBottomNavAdminRows,
  isMainBottomNavNewUnsavedRow,
  isMainBottomNavRowFieldsDirty,
  isMainBottomNavRowsOrderEqual,
  mainBottomNavRowToApiItem,
  restoreMainBottomNavRowsFromBaseline,
  revertMainBottomNavRowFieldsFromBaseline,
} from "@/lib/main-menu/main-bottom-nav-admin-edit";
import {
  generateCustomBottomNavTabId,
  isBuiltinBottomNavTabId,
} from "@/lib/main-menu/resolve-main-bottom-nav";
import { notifyMainBottomNavConfigChanged } from "@/lib/app/fetch-main-bottom-nav-deduped";

const MAX_TABS = 10;

const ADMIN_MAIN_BOTTOM_NAV_FETCH_INIT: RequestInit = {
  cache: "no-store",
  credentials: "include",
};

type MainBottomNavListResponse = {
  ok: boolean;
  items?: MainBottomNavAdminRow[];
  from_db?: boolean;
  updated_at?: string | null;
  error?: string;
};

type MainBottomNavMutateResponse = MainBottomNavListResponse;

async function fetchMainBottomNavList(): Promise<{ res: Response; data: MainBottomNavListResponse }> {
  const res = await fetch("/api/admin/main-bottom-nav", ADMIN_MAIN_BOTTOM_NAV_FETCH_INIT);
  const data = (await res.json()) as MainBottomNavListResponse;
  return { res, data };
}

export function AdminMainBottomNavPage() {
  const { t } = useI18n();
  const defaultLabel = t("admin_menu_bottom_default_label");
  const [rows, setRows] = useState<MainBottomNavAdminRow[] | null>(null);
  const [baselineRows, setBaselineRows] = useState<MainBottomNavAdminRow[] | null>(null);
  const [fromDb, setFromDb] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [iconPickerRowId, setIconPickerRowId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const baselineById = useMemo(() => {
    if (!baselineRows) return new Map<string, MainBottomNavAdminRow>();
    return new Map(baselineRows.map((row) => [row.id, row]));
  }, [baselineRows]);

  const orderDirty = useMemo(() => {
    if (!rows || !baselineRows) return false;
    return !isMainBottomNavRowsOrderEqual(rows, baselineRows);
  }, [rows, baselineRows]);

  const rowFieldsDirtyMap = useMemo(() => {
    if (!rows || !baselineRows) return new Map<string, boolean>();
    const next = new Map<string, boolean>();
    for (const row of rows) {
      const baseline = baselineById.get(row.id);
      next.set(
        row.id,
        isMainBottomNavNewUnsavedRow(row.id, baselineRows) ||
          isMainBottomNavRowFieldsDirty(row, baseline, defaultLabel)
      );
    }
    return next;
  }, [rows, baselineRows, baselineById, defaultLabel]);

  const hasUnsavedChanges = useMemo(() => {
    if (!rows || !baselineRows) return false;
    if (rows.length !== baselineRows.length) return true;
    if (orderDirty) return true;
    return rows.some((row) => rowFieldsDirtyMap.get(row.id));
  }, [rows, baselineRows, orderDirty, rowFieldsDirtyMap]);

  const applyLoadedRows = useCallback(
    (items: MainBottomNavAdminRow[], fromDbValue: boolean, updatedAtValue: string | null) => {
      setRows(items);
      setBaselineRows(cloneMainBottomNavAdminRows(items));
      setFromDb(fromDbValue);
      setUpdatedAt(updatedAtValue);
    },
    []
  );

  const syncFromServer = useCallback(
    async (successMessage?: string) => {
      const { res, data } = await fetchMainBottomNavList();
      if (!res.ok || !data?.ok || !Array.isArray(data.items)) return false;
      applyLoadedRows(data.items, Boolean(data.from_db), typeof data.updated_at === "string" ? data.updated_at : null);
      if (successMessage) setMessage({ type: "ok", text: successMessage });
      return true;
    },
    [applyLoadedRows]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setIconPickerRowId(null);
    try {
      const { res, data } = await fetchMainBottomNavList();
      if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
        setMessage({
          type: "err",
          text: resolveAdminBottomNavApiError(t, data?.error, "admin_menu_bottom_err_load"),
        });
        setRows(null);
        setBaselineRows(null);
        return;
      }
      applyLoadedRows(data.items, Boolean(data.from_db), typeof data.updated_at === "string" ? data.updated_at : null);
    } catch {
      setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
      setRows(null);
      setBaselineRows(null);
    } finally {
      setLoading(false);
    }
  }, [applyLoadedRows, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, dir: -1 | 1) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const patchRow = (index: number, patch: Partial<MainBottomNavAdminRow>) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      if (!prev || prev.length >= MAX_TABS) return prev;
      const id = generateCustomBottomNavTabId();
      const row: MainBottomNavAdminRow = {
        id,
        visible: true,
        label: t("admin_menu_bottom_new_label"),
        href: "/philife",
        icon: "home",
        openInNewTab: false,
      };
      return [...prev, row];
    });
  };

  const removeRow = (index: number) => {
    const removedId = rows?.[index]?.id;
    setRows((prev) => {
      if (!prev || prev.length <= 1) return prev;
      const row = prev[index];
      if (isBuiltinBottomNavTabId(row.id)) return prev;
      return prev.filter((_, j) => j !== index);
    });
    if (removedId && iconPickerRowId === removedId) setIconPickerRowId(null);
  };

  const cancelRow = (index: number) => {
    if (!rows || !baselineRows) return;
    const row = rows[index];
    if (!row) return;

    if (isMainBottomNavNewUnsavedRow(row.id, baselineRows)) {
      removeRow(index);
      setMessage({ type: "ok", text: t("admin_menu_bottom_row_cancel_ok") });
      return;
    }

    if (!baselineById.has(row.id)) return;

    setRows((prev) => {
      if (!prev || !baselineRows) return prev;
      return revertMainBottomNavRowFieldsFromBaseline(prev, baselineRows, row.id);
    });
    setMessage({ type: "ok", text: t("admin_menu_bottom_row_cancel_ok") });
  };

  const cancelOrder = () => {
    if (!rows || !baselineRows || !orderDirty) return;
    setRows((prev) => {
      if (!prev || !baselineRows) return prev;
      return restoreMainBottomNavRowsFromBaseline(prev, baselineRows);
    });
    setMessage({ type: "ok", text: t("admin_menu_bottom_cancel_order_ok") });
  };

  const cancelAll = () => {
    if (!baselineRows || !hasUnsavedChanges) return;
    setRows(cloneMainBottomNavAdminRows(baselineRows));
    setIconPickerRowId(null);
    setMessage({ type: "ok", text: t("admin_menu_bottom_cancel_all_ok") });
  };

  const persistRows = useCallback(
    async (opts?: { rowId?: string; successMessageKey?: "admin_menu_bottom_save_ok" | "admin_menu_bottom_row_save_ok" }) => {
      if (!rows || rows.length === 0) return false;
      const rowId = opts?.rowId;
      if (rowId) setSavingRowId(rowId);
      else setSavingAll(true);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/main-bottom-nav", {
          ...ADMIN_MAIN_BOTTOM_NAV_FETCH_INIT,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: rows.map((r) => mainBottomNavRowToApiItem(r, defaultLabel)) }),
        });
        const data = (await res.json()) as MainBottomNavMutateResponse;
        if (!res.ok || !data?.ok) {
          setMessage({
            type: "err",
            text: resolveAdminBottomNavApiError(t, data?.error, "admin_menu_bottom_err_save"),
          });
          return false;
        }
        notifyMainBottomNavConfigChanged();
        const okMessage = t(opts?.successMessageKey ?? "admin_menu_bottom_save_ok");
        const synced = await syncFromServer(okMessage);
        if (!synced) {
          if (Array.isArray(data.items)) {
            applyLoadedRows(
              data.items,
              data.from_db !== false,
              typeof data.updated_at === "string" ? data.updated_at : updatedAt
            );
            setMessage({ type: "ok", text: okMessage });
            setIconPickerRowId(null);
            return true;
          }
          setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
          return false;
        }
        setIconPickerRowId(null);
        return true;
      } catch {
        setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
        return false;
      } finally {
        setSavingRowId(null);
        setSavingAll(false);
      }
    },
    [applyLoadedRows, defaultLabel, rows, syncFromServer, t, updatedAt]
  );

  const saveRow = async (rowId: string) => {
    await persistRows({ rowId, successMessageKey: "admin_menu_bottom_row_save_ok" });
  };

  const saveAll = async () => {
    await persistRows();
  };

  const reset = async () => {
    if (!confirm(t("admin_menu_bottom_reset_confirm"))) return;
    setSavingAll(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", {
        ...ADMIN_MAIN_BOTTOM_NAV_FETCH_INIT,
        method: "DELETE",
      });
      const data = (await res.json()) as MainBottomNavMutateResponse;
      if (!res.ok || !data?.ok) {
        setMessage({
          type: "err",
          text: resolveAdminBottomNavApiError(t, data?.error, "admin_menu_bottom_err_save"),
        });
        return;
      }
      notifyMainBottomNavConfigChanged();
      const resetOk = t("admin_menu_bottom_reset_ok");
      const synced = await syncFromServer(resetOk);
      if (!synced) {
        if (Array.isArray(data.items)) {
          applyLoadedRows(data.items, Boolean(data.from_db), typeof data.updated_at === "string" ? data.updated_at : null);
          setMessage({ type: "ok", text: resetOk });
          setIconPickerRowId(null);
          return;
        }
        setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
        return;
      }
      setIconPickerRowId(null);
    } catch {
      setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
    } finally {
      setSavingAll(false);
    }
  };

  const previewHref = (row: MainBottomNavAdminRow) => {
    if (!row.href.trim().startsWith("/")) return;
    openBottomNavHref(row.href, row.openInNewTab === true);
  };

  const saving = savingAll || savingRowId != null;
  const iconPickerRow = iconPickerRowId && rows ? rows.find((row) => row.id === iconPickerRowId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader titleKey="admin_menu_bottom_title" />
        <div className="flex flex-wrap items-center gap-2">
          {fromDb ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 sam-text-helper text-emerald-800">
              {t("admin_menu_bottom_from_db")}
            </span>
          ) : (
            <span className="rounded-full bg-sam-surface-muted px-2.5 py-1 sam-text-helper text-sam-muted">
              {t("admin_menu_bottom_from_code")}
            </span>
          )}
          {updatedAt ? (
            <span className="sam-text-helper text-sam-muted">
              {t("admin_menu_bottom_last_updated", { at: updatedAt })}
            </span>
          ) : null}
          {hasUnsavedChanges ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 sam-text-helper text-amber-900">
              {t("admin_menu_bottom_unsaved")}
            </span>
          ) : null}
        </div>
      </div>

      {message ? (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="sam-text-body text-sam-muted">{t("admin_menu_bottom_items_heading")}</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || loading || !rows || !hasUnsavedChanges}
            onClick={() => void saveAll()}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90 disabled:opacity-50"
          >
            {savingAll ? t("admin_menu_saving") : t("admin_menu_bottom_save_all")}
          </button>
          {hasUnsavedChanges ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={cancelAll}
              className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-2 sam-text-body text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {t("admin_menu_bottom_cancel_all")}
            </button>
          ) : null}
          {orderDirty ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={cancelOrder}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
            >
              {t("admin_menu_bottom_cancel_order")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving || loading || !rows || rows.length >= MAX_TABS}
            onClick={addRow}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {t("admin_menu_bottom_add_tab")}
          </button>
          {fromDb ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void reset()}
              className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-2 sam-text-body text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {t("admin_menu_bottom_reset_db")}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : !rows ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          {t("admin_menu_bottom_load_fail")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_menu_table_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[860px] border-collapse sam-text-helper">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-2 py-1.5 text-left font-medium text-sam-fg">{t("admin_menu_bottom_th_order")}</th>
                <th className="px-2 py-1.5 text-left font-medium text-sam-fg">{t("admin_menu_bottom_th_visible")}</th>
                <th className="px-2 py-1.5 text-left font-medium text-sam-fg">{t("admin_menu_bottom_th_icon")}</th>
                <th className="px-2 py-1.5 text-left font-medium text-sam-fg">{t("admin_menu_bottom_th_label")}</th>
                <th className="px-2 py-1.5 text-left font-medium text-sam-fg">{t("admin_menu_bottom_th_href")}</th>
                <th className="px-2 py-1.5 text-center font-medium text-sam-fg">{t("admin_menu_bottom_th_open_new")}</th>
                <th className="px-2 py-1.5 text-right font-medium text-sam-fg">{t("admin_menu_th_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const builtin = isBuiltinBottomNavTabId(row.id);
                const fieldsDirty = rowFieldsDirtyMap.get(row.id) ?? false;
                const rowDirty = fieldsDirty || orderDirty;
                const rowSaving = savingRowId === row.id;
                const isNewRow = isMainBottomNavNewUnsavedRow(row.id, baselineRows);
                const canCancelRow = fieldsDirty || isNewRow;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-sam-border-soft align-middle hover:bg-sam-app/50 ${
                      rowDirty ? "bg-amber-50/40" : ""
                    }`}
                  >
                    <td className="px-2 py-1 align-middle">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={i === 0 || saving}
                          onClick={() => move(i, -1)}
                          aria-label={t("admin_menu_bottom_move_up")}
                          className="rounded border border-sam-border px-1 py-0.5 sam-text-xxs text-sam-fg hover:bg-sam-app disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={i === rows.length - 1 || saving}
                          onClick={() => move(i, 1)}
                          aria-label={t("admin_menu_bottom_move_down")}
                          className="rounded border border-sam-border px-1 py-0.5 sam-text-xxs text-sam-fg hover:bg-sam-app disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <input
                        type="checkbox"
                        checked={row.visible}
                        disabled={saving}
                        onChange={(e) => patchRow(i, { visible: e.target.checked })}
                        className="h-4 w-4"
                        title={row.visible ? t("admin_menu_chip_applied") : t("admin_menu_chip_not_applied")}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MainBottomNavIconPickerTrigger
                        value={{ icon: row.icon, lucideIcon: row.lucideIcon }}
                        label={row.label.trim() || defaultLabel}
                        disabled={saving}
                        onOpen={() => setIconPickerRowId(row.id)}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <input
                        value={row.label}
                        disabled={saving}
                        onChange={(e) => patchRow(i, { label: e.target.value })}
                        className="w-full min-w-[72px] max-w-[140px] rounded border border-sam-border px-1.5 py-1 sam-text-helper"
                        maxLength={24}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <div className="flex min-w-[160px] items-center gap-1">
                        <input
                          value={row.href}
                          disabled={saving}
                          onChange={(e) => patchRow(i, { href: e.target.value })}
                          className="min-w-0 flex-1 rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={160}
                        />
                        <button
                          type="button"
                          disabled={saving || row.href.trim().length === 0}
                          onClick={() => previewHref(row)}
                          title={
                            row.openInNewTab
                              ? t("admin_menu_bottom_preview_link_new_tab")
                              : t("admin_menu_bottom_preview_link_same_tab")
                          }
                          className="shrink-0 rounded border border-sam-border bg-sam-app px-1.5 py-1 sam-text-xxs text-signature hover:bg-sam-surface"
                        >
                          {t("admin_menu_bottom_preview_link")}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={row.openInNewTab === true}
                        disabled={saving}
                        onChange={(e) => patchRow(i, { openInNewTab: e.target.checked })}
                        className="h-4 w-4"
                        title={t("admin_menu_bottom_open_new_tab")}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={saving || !rowDirty}
                          onClick={() => void saveRow(row.id)}
                          className="rounded border border-signature bg-signature/5 px-2 py-0.5 sam-text-xxs font-medium text-signature hover:bg-signature/10 disabled:opacity-30"
                        >
                          {rowSaving ? t("admin_menu_saving") : t("admin_menu_bottom_row_save")}
                        </button>
                        <button
                          type="button"
                          disabled={saving || !canCancelRow}
                          onClick={() => cancelRow(i)}
                          title={t("admin_menu_bottom_row_cancel_title")}
                          className={`rounded border px-2 py-0.5 sam-text-xxs disabled:opacity-30 ${
                            canCancelRow
                              ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              : "border-sam-border bg-sam-surface text-sam-muted"
                          }`}
                        >
                          {t("admin_menu_bottom_row_cancel")}
                        </button>
                        {!builtin ? (
                          <button
                            type="button"
                            disabled={saving || rows.length <= 1}
                            onClick={() => removeRow(i)}
                            className="rounded border border-red-200 bg-red-50 px-2 py-0.5 sam-text-xxs text-red-800 hover:bg-red-100 disabled:opacity-30"
                            title={
                              rows.length <= 1
                                ? t("admin_menu_bottom_delete_min_title")
                                : t("admin_menu_bottom_delete_tab_title")
                            }
                          >
                            {t("common_delete")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {iconPickerRow ? (
        <MainBottomNavIconPickerModal
          menuLabel={iconPickerRow.label.trim() || defaultLabel}
          value={{ icon: iconPickerRow.icon, lucideIcon: iconPickerRow.lucideIcon }}
          disabled={saving}
          onApply={(patch) => {
            setRows((prev) => {
              if (!prev) return prev;
              const index = prev.findIndex((row) => row.id === iconPickerRow.id);
              if (index < 0) return prev;
              const next = [...prev];
              next[index] = applyMainBottomNavIconPatch(next[index], patch);
              return next;
            });
          }}
          onClose={() => setIconPickerRowId(null)}
        />
      ) : null}
    </div>
  );
}
