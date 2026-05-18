"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminBoardRow } from "@/lib/admin-boards/getBoardsFromDb";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBoardCreateForm } from "@/components/admin/boards/AdminBoardCreateForm";

const BOARD_LIST_ERROR_KEYS: Record<string, MessageKey> = {
  supabase_unconfigured: "admin_board_err_supabase",
  forbidden: "admin_board_err_forbidden",
};

export function AdminBoardsPage() {
  const { t } = useI18n();
  const [boards, setBoards] = useState<AdminBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/boards", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        boards?: AdminBoardRow[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setBoards([]);
        const errKey = j.error ? BOARD_LIST_ERROR_KEYS[j.error] : undefined;
        setListError(
          errKey
            ? t(errKey)
            : j.error ?? t("admin_board_err_list_status", { status: String(res.status) })
        );
        return;
      }
      setBoards(Array.isArray(j.boards) ? j.boards : []);
    } catch {
      setBoards([]);
      setListError(t("admin_board_err_list_request"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader titleKey="admin_board_page_title" />
        <button
          type="button"
          disabled={loading}
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90 disabled:opacity-50"
        >
          {t("admin_board_add_btn")}
        </button>
      </div>

      <AdminBoardCreateForm open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => void load()} />

      {listError ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">{listError}</div>
      ) : null}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_board_loading")}
        </div>
      ) : boards.length === 0 && !listError ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_board_empty_hint")}
        </div>
      ) : boards.length === 0 ? null : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_board_th_service")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_board_th_name")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_board_th_slug")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_board_th_skin_form")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_board_th_visibility")}</th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_board_th_web")}</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                  <td className="px-3 py-2.5 text-sam-fg">
                    {b.service_name ?? b.service_slug ?? b.service_id}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-sam-fg">{b.name}</td>
                  <td className="px-3 py-2.5 font-mono sam-text-body-secondary text-sam-muted">{b.slug}</td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {b.skin_type} / {b.form_type}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        b.is_active ? "bg-green-50 text-green-800" : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {b.is_active ? t("admin_board_visible") : t("admin_board_hidden")}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href="/community"
                      className="text-signature hover:underline"
                    >
                      {t("admin_board_view_on_web")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
