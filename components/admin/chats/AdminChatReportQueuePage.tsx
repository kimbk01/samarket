"use client";

/**
 * 채팅 신고 단일 큐 (설계 §3-2) — 메신저·거래 채팅(레거시)·거래 신고(채팅방·메시지) 3원천.
 * 행 동작은 「처리」 하나 → 시트 S5 (방 상세와 같은 시트, 서버 단일 액션 `POST /api/admin/chat/report-queue/action`).
 * 검색·필터·정렬·페이지는 URL 상태, 이전 페이지는 URL `trail`.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
import {
  AdminChatReportSheet,
  adminChatReportActionsFor,
  type AdminChatReportSheetInput,
} from "@/components/admin/chats/AdminChatSheets";
import {
  buildChatReportQueueSearch,
  chatReportQueueAscending,
  CHAT_REPORT_QUEUE_DEFAULT_LIMIT,
  CHAT_REPORT_ROOM_DOMAINS,
  CHAT_REPORT_SOURCES,
  CHAT_REPORT_STATUS_FILTERS,
  parseChatReportQueueQuery,
  type ChatReportQueueQuery,
  type ChatReportQueueRow,
  type ChatReportSource,
  type ChatReportStatusFilter,
} from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import {
  adminListNextPage,
  adminListPrevPage,
  currentAdminListHref,
  readAdminListTrail,
  withAdminListTrail,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
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
  | { kind: "ready"; rows: ChatReportQueueRow[]; nextCursor: string | null; failedSources: ChatReportSource[] };

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

const INPUT = "rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";
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
  const trail = useMemo(() => readAdminListTrail(new URLSearchParams(spKey)), [spKey]);
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
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
    if (query.cursor) sp.set("cursor", query.cursor);
    sp.set("limit", String(CHAT_REPORT_QUEUE_DEFAULT_LIMIT));
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
          nextCursor?: string | null;
          failedSources?: ChatReportSource[];
          error?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setState({ kind: "error", code: json?.error || "load_failed", httpStatus: res.status });
          return;
        }
        setState({
          kind: "ready",
          rows: Array.isArray(json.rows) ? json.rows : [],
          nextCursor: json.nextCursor ?? null,
          failedSources: Array.isArray(json.failedSources) ? json.failedSources : [],
        });
      } catch {
        if (!cancelled) setState({ kind: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiSearch, reloadToken]);

  /** 필터 변경 = 첫 페이지(replace) · 페이지 이동 = push + trail. */
  const navigate = useCallback(
    (patch: Partial<ChatReportQueueQuery>, opts?: { trail?: string[] }) => {
      const next: ChatReportQueueQuery = { ...query, cursor: "", ...patch };
      const href = `${pathname}${withAdminListTrail(buildChatReportQueueSearch(next), opts?.trail ?? [])}`;
      if (opts?.trail) router.push(href, { scroll: true });
      else router.replace(href, { scroll: false });
    },
    [pathname, query, router]
  );

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate({ q: searchDraft });
  };

  const filtered = Boolean(
    query.q || query.target || query.source !== "all" || query.status !== "open" || query.sort || query.domain
  );

  return (
    <div className="space-y-4 p-4 md:p-6" data-admin-chat-report-queue="1">
      <AdminPageHeader titleKey="admin_menu_chat_report_queue" description={t("admin_chat_reports_desc")} />

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        data-admin-list-filters="chat-reports"
      >
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={t("admin_chat_reports_search_placeholder")}
          className={`${INPUT} min-w-[220px] flex-1`}
          aria-label={t("admin_chat_list_search")}
        />
        <select
          value={query.status}
          onChange={(e) => navigate({ status: e.target.value as ChatReportStatusFilter })}
          className={INPUT}
          aria-label={t("admin_chat_reports_filter_status")}
        >
          {CHAT_REPORT_STATUS_FILTERS.map((st) => (
            <option key={st} value={st}>
              {t(STATUS_FILTER_KEY[st])}
            </option>
          ))}
        </select>
        <select
          value={query.source}
          onChange={(e) => navigate({ source: e.target.value as ChatReportQueueQuery["source"] })}
          className={INPUT}
          aria-label={t("admin_chat_reports_filter_source")}
        >
          <option value="all">{t("admin_chat_reports_source_all")}</option>
          {CHAT_REPORT_SOURCES.map((src) => (
            <option key={src} value={src}>
              {t(SOURCE_KEY[src])}
            </option>
          ))}
        </select>
        <select
          value={query.domain}
          onChange={(e) => navigate({ domain: e.target.value as ChatReportQueueQuery["domain"] })}
          className={INPUT}
          aria-label={t("admin_chat_reports_filter_domain")}
        >
          <option value="">{t("admin_chat_rooms_filter_type_all")}</option>
          {CHAT_REPORT_ROOM_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {adminChatLabel("chat_domain", d, ko).label}
            </option>
          ))}
        </select>
        <select
          value={asc ? "oldest" : "newest"}
          onChange={(e) => navigate({ sort: e.target.value === "oldest" ? "oldest" : "newest" })}
          className={INPUT}
          aria-label={t("admin_chat_list_sort")}
        >
          <option value="oldest">{t("admin_chat_reports_sort_oldest")}</option>
          <option value="newest">{t("admin_chat_reports_sort_newest")}</option>
        </select>
        <div className="ml-auto flex gap-2">
          {filtered ? (
            <AdminActionButton
              variant="ghost"
              onClick={() => navigate({ q: "", target: "", source: "all", status: "open", sort: "", domain: "" })}
            >
              {t("admin_chat_list_clear_filters")}
            </AdminActionButton>
          ) : null}
          <AdminActionButton type="submit" variant="primary">
            {t("admin_chat_list_search")}
          </AdminActionButton>
        </div>
      </form>

      {query.target ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">{t("admin_chat_reports_chip_target")}</span>
          <AdminTechId id={query.target} />
          <button type="button" className="sam-text-helper text-sam-muted underline" onClick={() => navigate({ target: "" })}>
            {t("admin_chat_list_chip_clear")}
          </button>
        </div>
      ) : null}

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {state.kind === "ready" && state.failedSources.length > 0 ? (
        <div role="alert" className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-950">
          {t("admin_chat_reports_partial_failed", { sources: state.failedSources.map((src) => t(SOURCE_KEY[src])).join(", ") })}
        </div>
      ) : null}

      {state.kind === "loading" ? (
        <AdminLoadingState ko={ko} />
      ) : state.kind === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : state.rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={
            query.cursor
              ? t("admin_chat_list_empty_after_page")
              : query.status === "open" && !query.q && !query.target
                ? t("admin_chat_reports_empty_open")
                : t("admin_chat_reports_empty_filtered")
          }
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
              {state.rows.map((row) => {
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
                          variant="primary"
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

      {state.kind === "ready" && (query.cursor || state.nextCursor) ? (
        <nav className="flex flex-wrap items-center justify-end gap-2" aria-label={t("admin_chat_list_pages")} data-admin-list-pager="keyset">
          <AdminActionButton disabled={!query.cursor} onClick={() => navigate({ cursor: "" })}>
            {t("admin_chat_list_first")}
          </AdminActionButton>
          <AdminActionButton
            disabled={!query.cursor}
            onClick={() => {
              const p = adminListPrevPage(trail);
              navigate({ cursor: p.cursor }, { trail: p.trail });
            }}
          >
            {t("admin_chat_list_prev")}
          </AdminActionButton>
          <AdminActionButton
            disabled={!state.nextCursor}
            onClick={() => {
              const n = adminListNextPage(trail, query.cursor, state.nextCursor ?? "");
              navigate({ cursor: n.cursor }, { trail: n.trail });
            }}
          >
            {t("admin_chat_list_next")}
          </AdminActionButton>
        </nav>
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
