"use client";

/**
 * 제재 기록 (`/admin/reports/log`, 설계 v4 F3) — 신고 처리 이력(report_actions + reports).
 * 조회 = `GET /api/admin/reports/sanction-ledger` (권한 키 `reports`, 서버 페이지네이션).
 * 필터: 기간(PHT) · 처리 유형 · 대상 회원(닉네임/ID).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  SANCTION_LEDGER_ACTION_TYPES,
  type AdminSanctionLedgerRow,
} from "@/lib/admin-reports/admin-sanction-ledger-query";
import {
  messageKeyForReportAction,
  REPORT_STATUS_LABEL_KEYS,
  REPORT_TARGET_TYPE_LABEL_KEYS,
} from "@/lib/admin-reports/report-admin-i18n-keys";

type ListState =
  | { status: "loading" }
  | { status: "error"; code: string; httpStatus?: number }
  | { status: "ok"; rows: AdminSanctionLedgerRow[]; total: number };

const EXTRAS = ["action_type"] as const;

const FIELD =
  "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px] text-sam-fg";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-sam-muted";

export function AdminSanctionLedgerPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery<(typeof EXTRAS)[number]>({ extras: EXTRAS });
  const { query } = lq;
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/admin/reports/sanction-ledger?${lq.apiQueryString}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          rows?: AdminSanctionLedgerRow[];
          total?: number;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setState({ status: "error", code: json.error ?? "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.rows ?? [];
        setState({ status: "ok", rows, total: json.total ?? rows.length });
      } catch {
        if (!cancelled) setState({ status: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lq.apiQueryString, lq.refreshKey]);

  const actionLabel = (code: string) => {
    const mk = messageKeyForReportAction(code);
    return mk ? t(mk) : code;
  };
  const targetLabel = (r: AdminSanctionLedgerRow) => {
    const tk = REPORT_TARGET_TYPE_LABEL_KEYS[r.target_type];
    const type = tk ? t(tk) : r.target_type;
    return r.target_nickname ? `${type} · ${r.target_nickname}` : type;
  };
  const statusLabel = (s: string) => {
    const sk = REPORT_STATUS_LABEL_KEYS[s];
    return sk ? t(sk) : s || "—";
  };
  const pending = state.status === "loading";

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_reports_logs" />
      <p className="sam-text-body text-sam-muted">{t("admin_sanction_ledger_intro")}</p>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={pending}
        searchPlaceholder={ko ? "대상 회원 닉네임 또는 ID" : "Target member nickname or ID"}
      >
        <label className={LABEL}>
          {ko ? "처리 유형" : "Action"}
          <select
            className={FIELD}
            value={query.extras.action_type}
            onChange={(e) => lq.setExtra("action_type", e.target.value)}
          >
            <option value="">{ko ? "전체" : "All"}</option>
            {SANCTION_LEDGER_ACTION_TYPES.map((code) => (
              <option key={code} value={code}>
                {actionLabel(code)}
              </option>
            ))}
          </select>
        </label>
      </AdminFilterBar>

      {state.status === "loading" ? (
        <AdminLoadingState ko={ko} />
      ) : state.status === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={lq.refresh} />
      ) : state.rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_sanction_ledger_empty")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[760px] border-collapse sam-text-body" data-admin-sanction-ledger-table="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_at")} (PHT)</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_action")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_target_type")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_reason")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_status")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{ko ? "처리자" : "By"}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_report_id")}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.action_id} className="border-b border-sam-border-soft hover:bg-sam-app">
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(r.action_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-body-secondary text-sam-fg">
                      {actionLabel(r.action_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">{targetLabel(r)}</td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-sam-muted">{r.reason_code || "—"}</td>
                  <td className="px-3 py-2.5 text-sam-muted">{statusLabel(r.report_status)}</td>
                  <td className="px-3 py-2.5 text-sam-muted">{r.admin_nickname ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/reports/${r.report_id}`} className="font-medium text-signature hover:underline">
                      {ko ? "신고 보기" : "Open report"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.status === "ok" && state.total > 0 ? (
        <AdminPagination
          ko={ko}
          page={query.page}
          size={query.size}
          total={state.total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={pending}
        />
      ) : null}
    </div>
  );
}
