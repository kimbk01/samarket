"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminBoardRow } from "@/lib/admin-boards/getBoardsFromDb";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBoardCreateForm } from "@/components/admin/boards/AdminBoardCreateForm";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

const BOARD_LIST_ERROR_KEYS: Record<string, MessageKey> = {
  supabase_unconfigured: "admin_board_err_supabase",
  forbidden: "admin_board_err_forbidden",
};

export function AdminBoardsPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const [boards, setBoards] = useState<AdminBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** 불러오기 실패 — 표준 오류 상태(코드·HTTP) + 게시판 전용 안내(`hint`, 기존 오류 키 맵) */
  const [listError, setListError] = useState<{ code: string; httpStatus?: number; hint?: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // IA-02/J-6: 게시판 생성 = 최고관리자 전용 (서버 requireSuperAdmin) — 조회는 전원
  const writeAction = useAdminRouteAction("/admin/boards");

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
        setListError({
          code: adminSafeErrorCode(j.error, "load_failed"),
          httpStatus: res.status,
          hint: errKey ? t(errKey) : undefined,
        });
        return;
      }
      setBoards(Array.isArray(j.boards) ? j.boards : []);
    } catch {
      setBoards([]);
      setListError({ code: "network_error", hint: t("admin_board_err_list_request") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-surface="legacy" data-admin-quarantine="boards">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader titleKey="admin_board_page_title" />
        <AdminActionButton
          disabled={loading || !writeAction.allowed}
          title={writeAction.reason ?? undefined}
          onClick={() => setCreateOpen(true)}
          variant="primary"
          className="shrink-0"
        >
          {t("admin_board_add_btn")}
        </AdminActionButton>
      </div>

      <p
        className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-warning"
        data-testid="admin-legacy-boards-quarantine-banner"
      >
        {safeT("admin_legacy_boards_quarantine_banner", {
          fallbackKo:
            "LEGACY · boards 테이블 표면입니다. Community 운영 SSOT는 주제/게시물입니다.",
          fallbackEn:
            "LEGACY · boards table surface. Community ops SSOT is topics/posts.",
        })}{" "}
        <Link href="/admin/community/topics" className="font-medium text-signature underline" prefetch={false}>
          {safeT("admin_legacy_boards_goto_topics", {
            fallbackKo: "커뮤니티 주제",
            fallbackEn: "Community topics",
          })}
        </Link>
      </p>

      {!writeAction.allowed && writeAction.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          게시판 추가 비활성: {writeAction.reason}
        </p>
      ) : null}

      <AdminBoardCreateForm open={createOpen && writeAction.allowed} onClose={() => setCreateOpen(false)} onCreated={() => void load()} />

      {/* 불러오기 실패 — 표준 오류 상태 + [새로고침] · 게시판 전용 안내는 아래 한 줄 */}
      {listError && !loading ? (
        <div className="space-y-2">
          <AdminErrorState ko={ko} code={listError.code} httpStatus={listError.httpStatus} onRetry={() => void load()} />
          {listError.hint ? <p className="sam-text-helper text-sam-muted">{listError.hint}</p> : null}
        </div>
      ) : null}

      {loading ? (
        <AdminLoadingState ko={ko} label={t("admin_board_loading")} />
      ) : boards.length === 0 && !listError ? (
        <AdminEmptyState ko={ko} message={t("admin_board_empty_hint")} />
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
                        b.is_active ? "bg-sam-success-soft text-sam-success" : "bg-sam-surface-muted text-sam-muted"
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
