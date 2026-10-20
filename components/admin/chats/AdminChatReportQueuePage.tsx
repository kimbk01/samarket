"use client";

/**
 * 채팅 신고 단일 큐 (설계 §3-2) — 메신저·거래 채팅(레거시)·거래 신고(채팅방·메시지) 3원천.
 * 행 동작은 「처리」 하나 → 시트 S5 (방 상세와 같은 시트, 서버 단일 액션 `POST /api/admin/chat/report-queue/action`).
 * 검색·필터·정렬·페이지는 URL 상태. R7 — 서버 페이지(page/size → limit/offset) + 전체 건수(AdminPagination).
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminChatReportSheet,
  adminChatReportActionsFor,
  type AdminChatReportSheetInput,
} from "@/components/admin/chats/AdminChatSheets";
import {
  buildChatReportQueueSearch,
  chatReportQueueAscending,
  CHAT_REPORT_ROOM_DOMAINS,
  CHAT_REPORT_SOURCES,
  CHAT_REPORT_STATUS_FILTERS,
  parseChatReportQueueQuery,
  type ChatReportQueuePageSize,
  type ChatReportQueueQuery,
  type ChatReportQueueRow,
  type ChatReportSource,
  type ChatReportStatusFilter,
} from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import { currentAdminListHref } from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import {
  adminChatRoomDetailHref,
  adminLegacyTradeChatDetailHref,
  adminUserDetailHref,
} from "@/lib/admin/chat-admin/admin-chat-links";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: string; httpStatus?: number }
  | { kind: "ready"; rows: ChatReportQueueRow[]; total: number; failedSources: ChatReportSource[] };

const SOURCE_KEY: Record<ChatReportSource, MessageKey> = {
  messenger: "admin_chat_report_source_messenger",
  trade_chat: "admin_chat_report_source_trade_chat",
  trade_report: "admin_chat_report_source_trade_report",
};

const STATUS_FILTER_KEY: Record<ChatReportStatusFilter, MessageKey> = {
  open: "admin_chat_reports_status_open",
  received: "admin_chat_reports_status_received",
  reviewing: "admin_chat_reports_status_reviewing",
  resolved: "admin_chat_reports_status_resolved",
  dismissed: "admin_chat_reports_status_dismissed",
  all: "admin_chat_reports_status_all",
};

const INPUT = "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px] text-sam-fg";
const FILTER_LABEL = "flex flex-col gap-1 text-[12px] font-medium text-sam-muted";
const TH = "px-3 py-2.5 text-left text-xs font-medium text-sam-muted";

function sheetInputFor(
  row: ChatReportQueueRow,
  ko: boolean,
  returnTo: string
): AdminChatReportSheetInput {
  const cm = row.source === "messenger";
  return {
    source: row.source,
    id: row.id,
    bucket: row.bucket,
    reasonLabel: adminChatLabel("report_reason", row.reasonCode, ko).label,
    detail: row.reasonDetail,
    reporterLabel: row.reporterLabel,
    reportedLabel: row.reportedUserLabel,
    createdAt: row.createdAt,
    cmMessageId: cm ? row.messageId : null,
    cmRoomId: cm && row.roomKind === "cm" ? row.roomId : null,
    reportedUserHref: row.reportedUserId ? adminUserDetailHref(row.reportedUserId, returnTo) : null,
  };
}

export function AdminChatReportQueuePage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/chats/reported";
  const searchParams = useSearchParams();
  const spKey = searchParams?.toString() ?? "";
  const query = useMemo(() => parseChatReportQueueQuery(new URLSearchParams(spKey)), [spKey]);
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  /** 마지막 정상 목록 — 다시 불러오기 실패 시 지우지 않는다 (지시서 §8-5). */
  const [lastReady, setLastReady] = useState<Extract<LoadState, { kind: "ready" }> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchDraft, setSearchDraft] = useState(query.q);
  const [sheetRow, setSheetRow] = useState<ChatReportQueueRow | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const asc = chatReportQueueAscending(query);

  useEffect(() => {
    setSearchDraft(query.q);
  }, [query.q]);

  const apiSearch = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("type", query.source);
    sp.set("status", query.status);
    if (query.target) sp.set("target", query.target);
    if (query.q) sp.set("q", query.q);
    if (query.sort) sp.set("sort", query.sort);
    if (query.domain) sp.set("domain", query.domain);
    sp.set("limit", String(query.size));
    sp.set("offset", String((query.page - 1) * query.size));
    return `?${sp.toString()}`;
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/chat/report-queue${apiSearch}`, { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          rows?: ChatReportQueueRow[];
          total?: number;
          failedSources?: ChatReportSource[];
          error?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setState({ kind: "error", code: json?.error || "load_failed", httpStatus: res.status });
          return;
        }
        const ready = {
          kind: "ready" as const,
          rows: Array.isArray(json.rows) ? json.rows : [],
          total: typeof json.total === "number" && json.total >= 0 ? json.total : 0,
          failedSources: Array.isArray(json.failedSources) ? json.failedSources : [],
        };
        setState(ready);
        setLastReady(ready);
      } catch {
        if (!cancelled) setState({ kind: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiSearch, reloadToken]);

  /** 필터 변경 = 첫 페이지(replace) · 페이지 이동 = push (뒤로가기로 이전 페이지). */
  const navigate = useCallback(
    (patch: Partial<ChatReportQueueQuery>, opts?: { pageMove?: boolean }) => {
      const next: ChatReportQueueQuery = { ...query, cursor: "", page: 1, ...patch };
      const href = `${pathname}${buildChatReportQueueSearch(next)}`;
      if (href === `${pathname}${spKey ? `?${spKey}` : ""}`) {
        setReloadToken((n) => n + 1);
        return;
      }
      if (opts?.pageMove) router.push(href, { scroll: true });
      else router.replace(href, { scroll: false });
    },
    [pathname, query, router, spKey, setReloadToken]
  );

  const resetFilters = () => navigate({ q: "", target: "", source: "all", status: "open", sort: "", domain: "" });

  const filtered = Boolean(
    query.q || query.target || query.source !== "all" || query.status !== "open" || query.sort || query.domain
  );
  /** 표시할 목록 — 불러오는 중·실패 시에도 마지막 정상 목록 유지. */
  const view = state.kind === "ready" ? state : lastReady;

  return (
    <div className="space-y-4 p-4 md:p-6" data-admin-chat-report-queue="1">
      <AdminPageHeader titleKey="admin_menu_chat_report_queue" description={t("admin_chat_reports_desc")} />

      <div data-admin-list-filters="chat-reports">
        <AdminFilterBar
          ko={ko}
          draft={{ q: searchDraft, from: "", to: "" }}
          onDraftChange={(p) => {
            if (p.q !== undefined) setSearchDraft(p.q);
          }}
          onSubmit={() => navigate({ q: searchDraft })}
          onReset={resetFilters}
          pending={state.kind === "loading"}
          showPeriod={false}
          searchPlaceholder={t("admin_chat_reports_search_placeholder")}
        >
          <label className={FILTER_LABEL}>
            {t("admin_chat_reports_filter_status")}
            <select
              value={query.status}
              onChange={(e) => navigate({ status: e.target.value as ChatReportStatusFilter })}
              className={INPUT}
            >
              {CHAT_REPORT_STATUS_FILTERS.map((st) => (
                <option key={st} value={st}>
                  {t(STATUS_FILTER_KEY[st])}
                </option>
              ))}
            </select>
          </label>
          <label className={FILTER_LABEL}>
            {t("admin_chat_reports_filter_source")}
            <select
              value={query.source}
              onChange={(e) => navigate({ source: e.target.value as ChatReportQueueQuery["source"] })}
              className={INPUT}
            >
              <option value="all">{t("admin_chat_reports_source_all")}</option>
              {CHAT_REPORT_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {t(SOURCE_KEY[src])}
                </option>
              ))}
            </select>
          </label>
          <label className={FILTER_LABEL}>
            {t("admin_chat_reports_filter_domain")}
            <select
              value={query.domain}
              onChange={(e) => navigate({ domain: e.target.value as ChatReportQueueQuery["domain"] })}
              className={INPUT}
            >
              <option value="">{t("admin_chat_rooms_filter_type_all")}</option>
              {CHAT_REPORT_ROOM_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {adminChatLabel("chat_domain", d, ko).label}
                </option>
              ))}
            </select>
          </label>
          <label className={FILTER_LABEL}>
            {t("admin_chat_list_sort")}
            <select
              value={asc ? "oldest" : "newest"}
              onChange={(e) => navigate({ sort: e.target.value === "oldest" ? "oldest" : "newest" })}
              className={INPUT}
            >
              <option value="oldest">{t("admin_chat_reports_sort_oldest")}</option>
              <option value="newest">{t("admin_chat_reports_sort_newest")}</option>
            </select>
          </label>
        </AdminFilterBar>
      </div>

      {query.target ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">{t("admin_chat_reports_chip_target")}</span>
          <AdminTechId id={query.target} />
          <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => navigate({ target: "" })}>
            {t("admin_chat_list_chip_clear")}
          </AdminActionButton>
        </div>
      ) : null}

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {view && view.failedSources.length > 0 ? (
        <div role="alert" className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-warning">
          {t("admin_chat_reports_partial_failed", { sources: view.failedSources.map((src) => t(SOURCE_KEY[src])).join(", ") })}
        </div>
      ) : null}

      {state.kind === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : null}
      {view == null ? (
        state.kind === "loading" ? <AdminLoadingState ko={ko} /> : null
      ) : view.rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={
            query.page > 1
              ? t("admin_chat_list_empty_after_page")
              : query.status === "open" && !query.q && !query.target
                ? t("admin_chat_reports_empty_open")
                : t("admin_chat_reports_empty_filtered")
          }
          onReset={filtered ? resetFilters : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[900px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className={TH}>{t("admin_chat_reports_col_received")}</th>
                <th className={TH}>{t("admin_chat_reports_col_source")}</th>
                <th className={TH}>{t("admin_chat_reports_col_reason")}</th>
                <th className={TH}>{t("admin_chat_sheet_reporter")}</th>
                <th className={TH}>{t("admin_chat_reports_col_status")}</th>
                <th className={TH}>{t("admin_chat_reports_col_action")}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => {
                const status = adminChatLabel("report_status", row.rawStatus, ko);
                const reason = adminChatLabel("report_reason", row.reasonCode, ko);
                const target = adminChatLabel("report_target", row.targetType, ko);
                const roomHref = row.roomId
                  ? row.roomKind === "cm"
                    ? adminChatRoomDetailHref(row.roomId, returnTo)
                    : adminLegacyTradeChatDetailHref(row.roomId, returnTo)
                  : null;
                const input = sheetInputFor(row, ko, returnTo);
                const canHandle = adminChatReportActionsFor(input).length > 0;
                return (
                  <tr key={row.key} className="border-b border-sam-border/70 align-top last:border-0" data-admin-chat-report-row={row.key}>
                    <td className="px-3 py-2.5 whitespace-nowrap sam-text-body-secondary text-sam-muted">
                      {row.createdAt ? formatAdminDateTime(row.createdAt, language) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-sam-fg">{t(SOURCE_KEY[row.source])}</div>
                      <div className="mt-0.5 sam-text-body-secondary text-sam-muted">{target.label}</div>
                      {roomHref ? (
                        <Link href={roomHref} className="mt-1 inline-block text-signature underline">
                          {t("admin_chat_reports_open_room")}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminToneBadge tone={reason.tone}>{reason.label}</AdminToneBadge>
                      {row.reasonDetail ? (
                        <p className="mt-1 line-clamp-2 max-w-[260px] sam-text-body-secondary text-sam-fg">{row.reasonDetail}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 sam-text-body-secondary">
                      {row.reporterId ? (
                        <Link href={adminUserDetailHref(row.reporterId, returnTo)} className="text-signature underline">
                          {row.reporterLabel || t("admin_chat_reports_reporter")}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">—</span>
                      )}
                      <span className="mx-1 text-sam-muted">→</span>
                      {row.reportedUserId ? (
                        <Link href={adminUserDetailHref(row.reportedUserId, returnTo)} className="text-signature underline">
                          {row.reportedUserLabel || t("admin_chat_reports_reported")}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">{t("admin_chat_reports_room_level")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                      {row.handledAt ? (
                        <div className="mt-1 sam-text-xxs text-sam-muted">{formatAdminDateTime(row.handledAt, language)}</div>
                      ) : null}
                      {row.adminNote ? <p className="mt-1 max-w-[200px] sam-text-xxs text-sam-muted">{row.adminNote}</p> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {canHandle ? (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          disabled={sheetRow !== null}
                          onClick={() => setSheetRow(row)}
                          data-admin-chat-report-action="handle"
                        >
                          {t("admin_chat_report_process_cta")}
                        </AdminActionButton>
                      ) : (
                        <span className="sam-text-helper text-sam-muted">{t("admin_chat_reports_handled")}</span>
                      )}
                      <AdminTechDetails ko={ko}>
                        {row.key}
                        {row.roomId ? ` · room ${row.roomId}` : ""}
                        {row.messageId ? ` · msg ${row.messageId}` : ""}
                        {` · ${row.rawStatus}`}
                      </AdminTechDetails>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view && (view.total > 0 || query.page > 1) ? (
        <AdminPagination
          ko={ko}
          page={query.page}
          size={query.size}
          total={view.total}
          disabled={state.kind === "loading"}
          onPageChange={(page) => navigate({ page }, { pageMove: true })}
          onSizeChange={(size) => navigate({ size: size as ChatReportQueuePageSize })}
        />
      ) : null}

      {sheetRow ? (
        <AdminChatReportSheet
          report={sheetInputFor(sheetRow, ko, returnTo)}
          onClose={() => setSheetRow(null)}
          onSettled={(kind) => {
            setSheetRow(null);
            setResult({
              ok: true,
              message: t(kind === "done" ? "admin_chat_sheet_done" : kind === "stale" ? "admin_chat_sheet_stale" : "admin_chat_sheet_gone"),
            });
            emitAdminQueueChanged();
            setReloadToken((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}
