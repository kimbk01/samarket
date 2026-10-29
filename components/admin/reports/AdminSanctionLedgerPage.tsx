"use client";

/**
 * 제재 기록 (`/admin/reports/log`, 설계 v4 F3) — 신고 처리 이력(report_actions + reports)
 * + RS-02: 기능 제한·경고(sanctions) · 계정 정지·차단·복구(user_moderation_events) 조회 전용.
 * 조회 = `GET /api/admin/reports/sanction-ledger?cursor=` (권한 키 `users`, 원장별 커서 병합).
 * 필터: 기간(PHT) · 처리 유형(신고 처리 기록만) · 대상 회원(닉네임/ID).
 */

import Link from "next/link";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminCount } from "@/lib/admin/pagination/admin-pagination-window";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { ADMIN_LIST_PAGE_SIZES, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  SANCTION_LEDGER_ACTION_TYPES,
  SANCTION_LEDGER_SOURCE_LABEL,
  type AdminSanctionLedgerRow,
  type SanctionLedgerExclusion,
  type SanctionLedgerSource,
} from "@/lib/admin-reports/admin-sanction-ledger-query";
import {
  messageKeyForReportAction,
  REPORT_STATUS_LABEL_KEYS,
  REPORT_TARGET_TYPE_LABEL_KEYS,
} from "@/lib/admin-reports/report-admin-i18n-keys";

type ListState =
  | { status: "loading" }
  | { status: "error"; code: string; httpStatus?: number }
  | {
      status: "ok";
      rows: AdminSanctionLedgerRow[];
      total: number;
      nextCursor: string | null;
      excluded: SanctionLedgerExclusion[];
      partial: boolean;
    };

/** sanctions·계정 조치 처리 유형 표시 (report_actions 는 기존 라벨 표) */
const EXTRA_ACTION_LABEL: Record<string, { ko: string; en: string }> = {
  warning: { ko: "경고", en: "Warning" },
  trade_restriction: { ko: "거래 활동 제한", en: "Trade restriction" },
  community_restriction: { ko: "커뮤니티 활동 제한", en: "Community restriction" },
  chat_ban: { ko: "채팅 금지", en: "Chat ban" },
  temp_suspend: { ko: "일시 정지", en: "Temporary suspension" },
  permanent_ban: { ko: "영구 정지", en: "Permanent ban" },
  warn: { ko: "경고", en: "Warning" },
  suspend: { ko: "계정 정지", en: "Account suspended" },
  ban: { ko: "계정 차단", en: "Account banned" },
  restore: { ko: "계정 복구", en: "Account restored" },
  soft_delete: { ko: "탈퇴 처리", en: "Soft delete" },
  hard_delete: { ko: "영구 삭제", en: "Hard delete" },
  purge: { ko: "데이터 삭제", en: "Purge" },
};

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
  /** RS-02 원장별 커서 — 조건(`base`)이 바뀌면 처음 쪽부터. */
  const baseQs = useMemo(() => {
    const sp = new URLSearchParams(lq.apiQueryString);
    sp.delete("offset");
    sp.delete("page");
    return sp.toString();
  }, [lq.apiQueryString]);
  const [paging, setPaging] = useState<{ base: string; cursor: string; trail: string[] }>({ base: "", cursor: "", trail: [] });
  const cursor = paging.base === baseQs ? paging.cursor : "";
  const trail = paging.base === baseQs ? paging.trail : [];

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const qs = new URLSearchParams(baseQs);
        qs.set("cursor", cursor);
        const res = await fetch(`/api/admin/reports/sanction-ledger?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          rows?: AdminSanctionLedgerRow[];
          total?: number;
          nextCursor?: string | null;
          excludedSources?: SanctionLedgerExclusion[];
          partial?: boolean;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setState({ status: "error", code: json.error ?? "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.rows ?? [];
        setState({
          status: "ok",
          rows,
          total: json.total ?? rows.length,
          nextCursor: json.nextCursor || null,
          excluded: json.excludedSources ?? [],
          partial: json.partial === true,
        });
      } catch {
        if (!cancelled) setState({ status: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseQs, cursor, lq.refreshKey]);

  const actionLabel = (code: string) => {
    const mk = messageKeyForReportAction(code);
    if (mk) return t(mk);
    const [kind, restriction] = code.split(":");
    const extra = EXTRA_ACTION_LABEL[kind];
    const base = extra ? (ko ? extra.ko : extra.en) : kind;
    return restriction ? `${base} (${restriction})` : base;
  };
  const sourceLabel = (src: SanctionLedgerSource | undefined) => {
    const l = SANCTION_LEDGER_SOURCE_LABEL[src ?? "report_actions"];
    return ko ? l.ko : l.en;
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
  const okState = state.status === "ok" ? state : null;
  const pageIndex = trail.length;
  const goNext = () => {
    if (!okState?.nextCursor || pending) return;
    setPaging({ base: baseQs, cursor: okState.nextCursor, trail: [...trail, cursor] });
  };
  const goPrev = () => {
    if (!trail.length || pending) return;
    setPaging({ base: baseQs, cursor: trail[trail.length - 1] ?? "", trail: trail.slice(0, -1) });
  };
  const excludedText = (reason: "permission" | "filter") =>
    (okState?.excluded ?? [])
      .filter((e) => e.reason === reason)
      .map((e) => `${sourceLabel(e.source)}${e.scope ? ` (${e.scope})` : ""}`)
      .join(", ");

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

      {okState?.partial ? (
        <div
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg"
          data-testid="admin-sanction-ledger-partial"
        >
          {ko
            ? `일부 원장 제외됨 — 열람 권한이 없는 원장은 목록과 건수에서 빠졌습니다: ${excludedText("permission")}`
            : `Some ledgers excluded — not in the list or count: ${excludedText("permission")}`}
        </div>
      ) : null}
      {excludedText("filter") ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
          {ko
            ? `처리 유형 조건은 신고 처리 기록에만 적용됩니다. 제외된 원장: ${excludedText("filter")}`
            : `The action filter applies to report actions only. Excluded: ${excludedText("filter")}`}
        </div>
      ) : null}

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
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{ko ? "원장" : "Ledger"}</th>
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
                <tr
                  key={`${r.source ?? "report_actions"}:${r.action_id}`}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                  data-ledger-source={r.source ?? "report_actions"}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(r.action_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <AdminToneBadge tone={r.source === "user_moderation_events" ? "danger" : r.source === "sanctions" ? "warning" : "neutral"}>
                      {sourceLabel(r.source)}
                    </AdminToneBadge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-body-secondary text-sam-fg">
                      {actionLabel(r.action_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">{targetLabel(r)}</td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-sam-muted">{r.reason_code || r.reason_text || "—"}</td>
                  <td className="px-3 py-2.5 text-sam-muted">{statusLabel(r.report_status)}</td>
                  <td className="px-3 py-2.5 text-sam-muted">{r.admin_nickname ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {r.source && r.source !== "report_actions" ? (
                      r.source_href ? (
                        <Link href={r.source_href} className="font-medium text-signature hover:underline">
                          {ko ? "처리 화면" : "Domain screen"}
                        </Link>
                      ) : (
                        "—"
                      )
                    ) : (
                      <Link href={`/admin/reports/${r.report_id}`} className="font-medium text-signature hover:underline">
                        {ko ? "신고 보기" : "Open report"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {okState && okState.total > 0 ? (
        /* RS-02 원장별 커서 — 이전·다음 쪽 (번호 이동 없음) */
        <nav
          className="flex flex-wrap items-center justify-end gap-2 sam-text-helper text-sam-muted"
          data-admin-sanction-ledger-cursor-pagination="1"
        >
          <span>
            {ko
              ? `전체 ${formatAdminCount(okState.total)}건 중 ${okState.rows.length ? pageIndex * query.size + 1 : 0}–${pageIndex * query.size + okState.rows.length}`
              : `${okState.rows.length ? pageIndex * query.size + 1 : 0}–${pageIndex * query.size + okState.rows.length} of ${formatAdminCount(okState.total)}`}
          </span>
          <AdminActionButton
            size="sm"
            onClick={goPrev}
            disabled={pending || trail.length === 0}
          >
            {ko ? "이전" : "Prev"}
          </AdminActionButton>
          <AdminActionButton
            size="sm"
            onClick={goNext}
            disabled={pending || !okState.nextCursor}
          >
            {ko ? "다음" : "Next"}
          </AdminActionButton>
          <select
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sam-fg"
            value={query.size}
            onChange={(e) => lq.setSize(Number(e.target.value) as AdminListPageSize)}
            disabled={pending}
            aria-label={ko ? "페이지 크기" : "Page size"}
          >
            {ADMIN_LIST_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {ko ? `${n}개씩` : `${n} / page`}
              </option>
            ))}
          </select>
        </nav>
      ) : null}
    </div>
  );
}
