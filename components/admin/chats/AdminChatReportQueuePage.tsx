"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction, type AdminConfirmLevel } from "@/lib/admin/operator-ux/admin-confirm-action";
import {
  buildChatReportQueueSearch,
  CHAT_REPORT_QUEUE_DEFAULT_LIMIT,
  CHAT_REPORT_SOURCES,
  parseChatReportQueueQuery,
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

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: string; httpStatus?: number }
  | { kind: "ready"; rows: ChatReportQueueRow[]; nextCursor: string | null; failedSources: ChatReportSource[] };

type QueueAction = {
  id: string;
  ko: string;
  en: string;
  level: AdminConfirmLevel;
  destructive?: boolean;
  /** 같은 출처의 기존 action API 요청. */
  request: (row: ChatReportQueueRow, reason: string) => { url: string; body: Record<string, unknown> };
};

const cmAction = (action: string) => (row: ChatReportQueueRow, reason: string) => ({
  url: `/api/admin/community-messenger/reports/${encodeURIComponent(row.id)}/action`,
  body: { action, reason, adminNote: reason },
});

/** 출처별 조치 — 서버(Area A)가 사유·상태 CAS·감사를 검증한다. 화면은 확인·사유·중복 클릭만 막는다. */
function actionsFor(row: ChatReportQueueRow): QueueAction[] {
  const pending = row.bucket === "received" || row.bucket === "reviewing";
  if (!pending) return [];
  if (row.source === "messenger") {
    const list: QueueAction[] = [];
    if (row.bucket === "received") {
      list.push({ id: "reviewing", ko: "검토 시작", en: "Start review", level: "L2", request: cmAction("reviewing") });
    }
    list.push({ id: "resolved", ko: "처리 완료", en: "Resolve", level: "L2", request: cmAction("resolved") });
    list.push({ id: "rejected", ko: "기각", en: "Dismiss", level: "L2", request: cmAction("rejected") });
    if (row.messageId) {
      list.push({
        id: "sanction_message_hide",
        ko: "메시지 숨김 제재",
        en: "Hide message",
        level: "L2",
        destructive: true,
        request: cmAction("sanction_message_hide"),
      });
    }
    if (row.roomId) {
      list.push({
        id: "sanction_room_block",
        ko: "채팅방 정지 제재",
        en: "Suspend room",
        level: "L2",
        destructive: true,
        request: cmAction("sanction_room_block"),
      });
    }
    return list;
  }
  if (row.source === "trade_chat") {
    return [
      {
        id: "close_report",
        ko: "조치 완료",
        en: "Mark actioned",
        level: "L2",
        request: (r, reason) => ({
          url: `/api/admin/chat/reports/${encodeURIComponent(r.id)}/action`,
          body: { action: "close_report", reason, note: reason },
        }),
      },
    ];
  }
  return [
    {
      id: "reject",
      ko: "기각",
      en: "Dismiss",
      level: "L2",
      request: (r, reason) => ({
        url: `/api/admin/reports/${encodeURIComponent(r.id)}/action`,
        body: { action_type: "reject", action_note: reason, target_user_id: r.reportedUserId ?? "" },
      }),
    },
  ];
}

const SOURCE_LABEL: Record<ChatReportSource, { ko: string; en: string }> = {
  messenger: { ko: "메신저 신고", en: "Messenger report" },
  trade_chat: { ko: "거래 채팅 신고 (구)", en: "Trade chat report (legacy)" },
  trade_report: { ko: "거래 신고 · 채팅방", en: "Trade report · chat room" },
};

const STATUS_FILTER_LABEL: Record<ChatReportStatusFilter, { ko: string; en: string }> = {
  open: { ko: "처리 대기 (접수·검토 중)", en: "Open (received · reviewing)" },
  received: { ko: "접수", en: "Received" },
  reviewing: { ko: "검토 중", en: "Reviewing" },
  resolved: { ko: "처리 완료", en: "Resolved" },
  dismissed: { ko: "기각", en: "Dismissed" },
  all: { ko: "전체", en: "All" },
};

const INPUT = "rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";
const BTN =
  "rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40";

export function AdminChatReportQueuePage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const L = (k: string, e: string) => (ko ? k : e);
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/chats/reported";
  const searchParams = useSearchParams();
  const spKey = searchParams?.toString() ?? "";
  const query = useMemo(() => parseChatReportQueueQuery(new URLSearchParams(spKey)), [spKey]);
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const apiSearch = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("type", query.source);
    sp.set("status", query.status);
    if (query.target) sp.set("target", query.target);
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

  const navigate = useCallback(
    (patch: Partial<ChatReportQueueQuery>, opts?: { push?: boolean }) => {
      const next: ChatReportQueueQuery = { ...query, cursor: "", ...patch };
      const href = `${pathname}${buildChatReportQueueSearch(next)}`;
      if (opts?.push) router.push(href, { scroll: true });
      else router.replace(href, { scroll: false });
    },
    [pathname, query, router]
  );

  const runAction = useCallback(
    async (row: ChatReportQueueRow, action: QueueAction) => {
      if (busyRef.current) return;
      const confirm = await confirmAdminAction({
        level: action.level,
        ko,
        title: `${SOURCE_LABEL[row.source][ko ? "ko" : "en"]} — ${ko ? action.ko : action.en}`,
        description: ko
          ? `사유: ${adminChatLabel("report_reason", row.reasonCode, true).label}. 처리 후에는 되돌릴 수 없습니다.`
          : `Reason: ${adminChatLabel("report_reason", row.reasonCode, false).label}. This cannot be undone.`,
        confirmLabel: ko ? action.ko : action.en,
        destructive: action.destructive,
      });
      if (!confirm.ok) return;
      busyRef.current = true;
      setBusyKey(row.key);
      setResult(null);
      try {
        const { url, body } = action.request(row, confirm.reason ?? "");
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || json?.ok === false) {
          setResult({
            ok: false,
            code: res.status === 409 ? "stale_lifecycle" : res.status === 403 ? "forbidden" : json?.error || "action_failed",
          });
        } else {
          setResult({ ok: true, message: ko ? "처리했습니다." : "Done." });
          emitAdminQueueChanged();
        }
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        busyRef.current = false;
        setBusyKey(null);
        setReloadToken((n) => n + 1);
      }
    },
    [ko]
  );

  return (
    <div className="space-y-4 p-4 md:p-6" data-admin-chat-report-queue="1">
      <AdminPageHeader
        titleKey="admin_menu_chat_report_queue"
        description={L(
          "메신저 신고·거래 채팅 신고(구)·통합 신고(채팅 대상)를 한 목록에서 처리합니다. 방을 누르면 상세로 이동하고, 돌아오면 같은 필터·페이지가 유지됩니다.",
          "Messenger, legacy trade chat and unified chat reports in one queue. Open a room for details; coming back keeps the same filters and page."
        )}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-list-filters="chat-reports">
        <select
          value={query.status}
          onChange={(e) => navigate({ status: e.target.value as ChatReportStatusFilter })}
          className={INPUT}
          aria-label={L("처리 상태", "Status")}
        >
          {(Object.keys(STATUS_FILTER_LABEL) as ChatReportStatusFilter[]).map((st) => (
            <option key={st} value={st}>
              {STATUS_FILTER_LABEL[st][ko ? "ko" : "en"]}
            </option>
          ))}
        </select>
        <select
          value={query.source}
          onChange={(e) => navigate({ source: e.target.value as ChatReportQueueQuery["source"] })}
          className={INPUT}
          aria-label={L("신고 유형", "Report type")}
        >
          <option value="all">{L("전체 유형", "All types")}</option>
          {CHAT_REPORT_SOURCES.map((src) => (
            <option key={src} value={src}>
              {SOURCE_LABEL[src][ko ? "ko" : "en"]}
            </option>
          ))}
        </select>
        {query.target ? (
          <span className="flex items-center gap-2 sam-text-body-secondary">
            <span className="text-sam-muted">{L("대상 (방·회원)", "Target (room · member)")}:</span>
            <span className="font-mono">{query.target.slice(0, 8)}…</span>
            <button type="button" className="sam-text-helper text-sam-muted underline" onClick={() => navigate({ target: "" })}>
              {L("해제", "Clear")}
            </button>
          </span>
        ) : null}
      </div>

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {state.kind === "ready" && state.failedSources.length > 0 ? (
        <div role="alert" className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-950">
          {L("일부 신고 출처를 불러오지 못했습니다: ", "Some report sources failed to load: ")}
          {state.failedSources.map((src) => SOURCE_LABEL[src][ko ? "ko" : "en"]).join(", ")}
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
              ? L("이 페이지 이후로 더 표시할 신고가 없습니다.", "No more reports after this page.")
              : query.status === "open"
                ? L("처리 대기 중인 채팅 신고가 없습니다.", "No pending chat reports.")
                : L("조건에 맞는 채팅 신고가 없습니다.", "No chat reports match these filters.")
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[900px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-sam-fg">
                <th className="px-3 py-2.5 font-medium">{L("접수", "Received")}</th>
                <th className="px-3 py-2.5 font-medium">{L("유형 · 대상", "Type · target")}</th>
                <th className="px-3 py-2.5 font-medium">{L("사유", "Reason")}</th>
                <th className="px-3 py-2.5 font-medium">{L("신고자 → 피신고자", "Reporter → reported")}</th>
                <th className="px-3 py-2.5 font-medium">{L("상태", "Status")}</th>
                <th className="px-3 py-2.5 font-medium">{L("조치", "Actions")}</th>
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
                const actions = actionsFor(row);
                const rowBusy = busyKey === row.key;
                return (
                  <tr key={row.key} className="border-b border-sam-border/70 align-top last:border-0" data-admin-chat-report-row={row.key}>
                    <td className="px-3 py-2.5 whitespace-nowrap sam-text-body-secondary text-sam-muted">
                      {row.createdAt ? formatAdminDateTime(row.createdAt, language) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-sam-fg">{SOURCE_LABEL[row.source][ko ? "ko" : "en"]}</div>
                      <div className="mt-0.5 sam-text-body-secondary text-sam-muted">{target.label}</div>
                      {roomHref ? (
                        <Link href={roomHref} className="mt-1 inline-block text-signature underline">
                          {L("채팅방 보기", "Open room")}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminToneBadge tone={reason.tone}>{reason.label}</AdminToneBadge>
                      {row.reasonDetail ? (
                        <p className="mt-1 line-clamp-3 max-w-[260px] sam-text-body-secondary text-sam-fg">{row.reasonDetail}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 sam-text-body-secondary">
                      {row.reporterId ? (
                        <Link href={adminUserDetailHref(row.reporterId, returnTo)} className="text-signature underline">
                          {row.reporterLabel || L("신고자", "Reporter")}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">—</span>
                      )}
                      <span className="mx-1 text-sam-muted">→</span>
                      {row.reportedUserId ? (
                        <Link href={adminUserDetailHref(row.reportedUserId, returnTo)} className="text-signature underline">
                          {row.reportedUserLabel || L("피신고자", "Reported")}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">{L("방 단위 신고", "Room report")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                      {row.handledAt ? (
                        <div className="mt-1 sam-text-xxs text-sam-muted">{formatAdminDateTime(row.handledAt, language)}</div>
                      ) : null}
                      {row.adminNote ? (
                        <p className="mt-1 max-w-[200px] sam-text-xxs text-sam-muted">{row.adminNote}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {actions.length === 0 ? (
                        <span className="sam-text-helper text-sam-muted">{L("처리됨", "Handled")}</span>
                      ) : (
                        <div className="flex max-w-[260px] flex-wrap gap-1.5">
                          {actions.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => void runAction(row, a)}
                              className={
                                a.destructive
                                  ? `${BTN} border-red-300 bg-red-50 text-red-900 hover:bg-red-100`
                                  : BTN
                              }
                              data-admin-chat-report-action={a.id}
                            >
                              {rowBusy ? L("처리 중…", "Working…") : ko ? a.ko : a.en}
                            </button>
                          ))}
                        </div>
                      )}
                      {row.source === "trade_report" && actions.length > 0 ? (
                        <Link
                          href={`/admin/reports?target_type=chat&target=${encodeURIComponent(row.messageId ?? row.roomId ?? "")}`}
                          className="mt-1 block sam-text-helper text-signature underline"
                        >
                          {L("회원 제재는 통합 신고 화면에서", "Sanction members in Reports")}
                        </Link>
                      ) : null}
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
        <nav className="flex flex-wrap items-center gap-2" aria-label={L("페이지", "Pages")} data-admin-list-pager="keyset">
          {query.cursor ? (
            <button type="button" className={BTN} onClick={() => navigate({ cursor: "" }, { push: true })}>
              {L("처음으로", "First page")}
            </button>
          ) : null}
          {query.cursor ? (
            <button type="button" className={BTN} onClick={() => router.back()}>
              {L("이전", "Previous")}
            </button>
          ) : null}
          {state.nextCursor ? (
            <button type="button" className={BTN} onClick={() => navigate({ cursor: state.nextCursor ?? "" }, { push: true })}>
              {L("다음", "Next")}
            </button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
