"use client";

/**
 * 통화 기록·강제 종료 (설계 §3-3) — `/admin/chats/calls`.
 * 탭: 진행 중(오래된 순) / 통화 기록(최신 순) / 강제 종료 기록 — 쪽 번호(`page`·`size` 20/50/100, 「총 N건」). 필터는 URL 상태 —
 * 대시보드 「통화 연결 실패」「수신 대기 정체」「최근 7일」 링크가 같은 조건으로 열린다.
 * 진행 중 행 「강제 종료」 → 시트 S4 (방 상세와 같은 시트). 강제 종료 분석은 `/admin/chats/calls/analysis`.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminChatForceEndSheet } from "@/components/admin/chats/AdminChatSheets";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import type { AdminChatCallAuditRow, AdminChatCallRow, AdminChatCallsPage as CallsPage } from "@/lib/admin-community-messenger/list-admin-call-sessions";
import {
  ADMIN_CHAT_CALL_STATUSES,
  ADMIN_CHAT_CALL_TABS,
  ADMIN_CHAT_CALL_WINDOWS,
  buildAdminChatCallsSearch,
  parseAdminChatCallsQuery,
  type AdminChatCallTab,
  type AdminChatCallsQuery,
} from "@/lib/admin/chat-admin/admin-chat-calls-url-state";
import {
  currentAdminListHref,
  parseAdminChatListPaging,
  withAdminChatListPaging,
  type AdminChatListPaging,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { adminChatRoomDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import type { MessageKey } from "@/lib/i18n/messages";

const TAB_KEY: Record<AdminChatCallTab, MessageKey> = {
  active: "admin_chat_calls_tab_active",
  records: "admin_chat_calls_tab_records",
  audits: "admin_chat_calls_tab_audits",
};

/** 진행 중 탭 실시간 갱신 — 통화 세션 변경 묶음을 한 번의 조회로 (메신저 Admin 개요와 같은 디바운스). */
const REALTIME_DEBOUNCE_MS = 900;

const INPUT = "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px] text-sam-fg";
const FILTER_LABEL = "flex flex-col gap-1 text-[12px] font-medium text-sam-muted";
const TH = "px-3 py-2.5 text-left text-xs font-medium text-sam-muted";

type LoadState = { kind: "loading" } | { kind: "error"; code: string; httpStatus?: number } | { kind: "ready"; page: CallsPage };

function elapsed(fromIso: string, nowMs: number): string {
  const sec = Math.max(0, Math.round((nowMs - Date.parse(fromIso)) / 1000));
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${sec % 60}s`;
}

export function AdminChatCallsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/chats/calls";
  const searchParams = useSearchParams();
  const spKey = searchParams?.toString() ?? "";
  const query = useMemo(() => parseAdminChatCallsQuery(new URLSearchParams(spKey)), [spKey]);
  const paging = useMemo(() => parseAdminChatListPaging(new URLSearchParams(spKey)), [spKey]);
  const returnTo = currentAdminListHref(pathname, spKey ? `?${spKey}` : "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  /** 마지막 정상 목록 — 다시 불러오기 실패 시 지우지 않는다 (지시서 §8-5). 탭이 바뀌면 버린다. */
  const [lastReady, setLastReady] = useState<CallsPage | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchDraft, setSearchDraft] = useState(query.q);
  const [forceEnd, setForceEnd] = useState<AdminChatCallRow | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** 실시간 갱신은 목록을 비우지 않고 조용히 다시 불러온다. */
  const silentRef = useRef(false);

  useEffect(() => setSearchDraft(query.q), [query.q]);

  const apiSearch = buildAdminChatCallsSearch(query);
  useEffect(() => {
    let cancelled = false;
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) setState({ kind: "loading" });
    (async () => {
      try {
        const sp = new URLSearchParams(apiSearch.startsWith("?") ? apiSearch.slice(1) : apiSearch);
        sp.set("tab", query.tab);
        sp.delete("cursor");
        sp.set("limit", String(paging.size));
        sp.set("offset", String((paging.page - 1) * paging.size));
        const res = await fetch(`/api/admin/community-messenger/calls?${sp.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as (CallsPage & { ok?: boolean; error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          if (!silent) setState({ kind: "error", code: json?.error || "load_failed", httpStatus: res.status });
          return;
        }
        setNowMs(Date.now());
        setState({ kind: "ready", page: json });
        setLastReady(json);
      } catch {
        if (!cancelled && !silent) setState({ kind: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiSearch, query.tab, reloadToken, paging.page, paging.size]);

  // 설계 §3-3: 진행 중 탭은 통화 세션·참여자 변경을 Realtime 으로 받아 조용히 갱신 (+ 「새로고침」).
  useEffect(() => {
    if (query.tab !== "active") return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        silentRef.current = true;
        setReloadToken((n) => n + 1);
      }, REALTIME_DEBOUNCE_MS);
    };
    const channel: RealtimeChannel = sb
      .channel("admin-chat-calls-active", messengerPrivateBroadcastChannelOptions())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_messenger_call_sessions" }, schedule)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_call_session_participants" },
        schedule
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [query.tab]);

  /** 필터·탭 변경 = 1쪽 (크기 유지) · 쪽 이동·크기 변경 = `pagingPatch`. 같은 주소면 다시 불러온다. */
  const navigate = useCallback(
    (patch: Partial<AdminChatCallsQuery>, pagingPatch?: Partial<AdminChatListPaging>) => {
      const next: AdminChatCallsQuery = { ...query, cursor: "", ...patch };
      const href = `${pathname}${withAdminChatListPaging(buildAdminChatCallsSearch(next), {
        size: paging.size,
        page: 1,
        ...pagingPatch,
      })}`;
      if (href === `${pathname}${spKey ? `?${spKey}` : ""}`) {
        setReloadToken((n) => n + 1);
        return;
      }
      router.replace(href, { scroll: Boolean(pagingPatch?.page) });
    },
    [paging.size, pathname, query, router, spKey, setReloadToken]
  );

  const resetFilters = () => navigate({ status: "", reason: "", kind: "", window: "", activity: "", stuck: false, q: "" });

  const filtered = Boolean(query.status || query.reason || query.kind || query.window || query.activity || query.stuck || query.q);
  const statusOptions = query.tab === "active" ? (["ringing", "active"] as const) : ADMIN_CHAT_CALL_STATUSES;
  /** 표시할 목록 — 같은 탭의 마지막 정상 목록을 불러오는 중·실패 시에도 유지. */
  const view: CallsPage | null =
    state.kind === "ready" ? state.page : lastReady && lastReady.tab === query.tab ? lastReady : null;

  return (
    <div className="space-y-4 p-4 md:p-6" data-admin-chat-calls={query.tab}>
      <AdminPageHeader titleKey="admin_menu_chat_call_records" description={t("admin_chat_calls_desc")} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <AdminTabs
          ariaLabel={t("admin_chat_calls_tabs")}
          param="tab"
          syncUrl={false}
          value={query.tab}
          onChange={(tab) => navigate({ tab: tab as AdminChatCallTab, status: "", stuck: false })}
          tabs={ADMIN_CHAT_CALL_TABS.map((tab) => ({ id: tab, label: t(TAB_KEY[tab]) }))}
          className="min-w-0 flex-1"
        />
        <div className="flex gap-2">
          <AdminActionButton onClick={() => setReloadToken((n) => n + 1)} disabled={state.kind === "loading"}>
            {t("admin_chat_calls_refresh")}
          </AdminActionButton>
          <AdminActionLink href="/admin/chats/calls/analysis" variant="ghost">
            {t("admin_chat_calls_analysis_link")}
          </AdminActionLink>
        </div>
      </div>

      <div data-admin-list-filters="chat-calls">
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
          searchPlaceholder={t("admin_chat_calls_search_placeholder")}
          status={
            query.tab !== "audits"
              ? {
                  value: query.status,
                  onChange: (v) => navigate({ status: v as AdminChatCallsQuery["status"] }),
                  label: t("admin_chat_calls_filter_status"),
                  options: [
                    { value: "", label: t("admin_chat_calls_filter_status_all") },
                    ...statusOptions.map((st) => ({ value: st, label: adminChatLabel("call_status", st, ko).label })),
                  ],
                }
              : undefined
          }
        >
          {query.tab !== "audits" ? (
            <label className={FILTER_LABEL}>
              {t("admin_chat_calls_filter_kind")}
              <select
                value={query.kind}
                onChange={(e) => navigate({ kind: e.target.value as AdminChatCallsQuery["kind"] })}
                className={INPUT}
              >
                <option value="">{t("admin_chat_calls_filter_kind_all")}</option>
                <option value="voice">{adminChatLabel("call_kind", "voice", ko).label}</option>
                <option value="video">{adminChatLabel("call_kind", "video", ko).label}</option>
              </select>
            </label>
          ) : null}
          <label className={FILTER_LABEL}>
            {t("admin_chat_calls_filter_window")}
            <select
              value={query.activity ? "activity_7d" : query.window}
              onChange={(e) =>
                navigate(
                  e.target.value === "activity_7d"
                    ? { activity: "7d", window: "" }
                    : { activity: "", window: e.target.value as AdminChatCallsQuery["window"] }
                )
              }
              className={INPUT}
            >
              <option value="">{t("admin_chat_calls_window_all")}</option>
              {ADMIN_CHAT_CALL_WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {t(`admin_cm_period_${w}` as MessageKey)}
                </option>
              ))}
              {query.activity ? <option value="activity_7d">{t("admin_chat_rooms_filter_activity_7d")}</option> : null}
            </select>
          </label>
          {query.tab === "records" ? (
            <label className="flex h-10 items-center gap-1.5 sam-text-body text-sam-fg">
              <input type="checkbox" checked={query.reason === "failed"} onChange={(e) => navigate({ reason: e.target.checked ? "failed" : "" })} />
              {t("admin_chat_calls_filter_failed")}
            </label>
          ) : null}
          {query.tab === "active" ? (
            <label className="flex h-10 items-center gap-1.5 sam-text-body text-sam-fg">
              <input type="checkbox" checked={query.stuck} onChange={(e) => navigate({ stuck: e.target.checked })} />
              {t("admin_chat_calls_filter_stuck")}
            </label>
          ) : null}
        </AdminFilterBar>
      </div>

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {state.kind === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : null}
      {view == null ? (
        state.kind === "loading" ? <AdminLoadingState ko={ko} /> : null
      ) : view.rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={
            paging.page > 1
              ? t("admin_chat_list_empty_after_page")
              : filtered
                ? t("admin_chat_calls_empty_filtered")
                : query.tab === "active"
                  ? t("admin_chat_calls_empty_active")
                  : t("admin_chat_calls_empty")
          }
          onReset={filtered ? resetFilters : undefined}
        />
      ) : view.tab === "audits" ? (
        <AuditTable rows={view.rows} returnTo={returnTo} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[900px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className={TH}>{t("admin_chat_calls_col_started")}</th>
                <th className={TH}>{query.tab === "active" ? t("admin_chat_calls_col_elapsed") : t("admin_chat_calls_col_duration")}</th>
                <th className={TH}>{t("admin_chat_calls_col_kind")}</th>
                <th className={TH}>{t("admin_chat_calls_col_room")}</th>
                <th className={TH}>{t("admin_chat_calls_col_initiator")}</th>
                <th className={TH}>{t("admin_chat_calls_col_result")}</th>
                {query.tab === "active" ? <th className={TH}>{t("admin_chat_reports_col_action")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {(view.rows as AdminChatCallRow[]).map((call) => {
                const status = adminChatLabel("call_status", call.status, ko);
                const domain = adminChatLabel("chat_domain", call.chatDomain, ko);
                return (
                  <tr key={call.id} className="border-b border-sam-border/70 align-top last:border-0" data-admin-chat-call-row={call.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap sam-text-body-secondary text-sam-muted">
                      {formatAdminDateTime(call.createdAt, language)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {query.tab === "active"
                        ? elapsed(call.createdAt, nowMs)
                        : call.durationSeconds != null
                          ? t("admin_chat_calls_seconds", { seconds: call.durationSeconds })
                          : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {adminChatLabel("call_kind", call.callKind, ko).label}
                      <div className="sam-text-xxs text-sam-muted">
                        {call.sessionMode === "group" ? t("admin_cm_call_group") : t("admin_cm_call_direct")}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {call.roomId ? (
                        <Link href={adminChatRoomDetailHref(call.roomId, returnTo)} className="text-signature underline">
                          {call.roomTitle || t("admin_chat_rooms_untitled")}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {call.chatDomain ? (
                        <div className="mt-1">
                          <AdminToneBadge tone={domain.tone}>{domain.label}</AdminToneBadge>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {call.initiatorLabel || "—"}
                      <div className="sam-text-xxs text-sam-muted">{t("admin_chat_calls_participants", { count: call.participantCount })}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                      {call.endedReason ? (
                        <div className="mt-1 sam-text-xxs text-sam-muted">
                          {adminChatLabel("call_ended_reason", call.endedReason.split(":")[0], ko).label}
                        </div>
                      ) : null}
                    </td>
                    {query.tab === "active" ? (
                      <td className="px-3 py-2.5">
                        <AdminActionButton variant="danger" size="sm" disabled={forceEnd !== null} onClick={() => setForceEnd(call)}>
                          {t("admin_cm_action_force_end")}
                        </AdminActionButton>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view ? (
        <AdminPagination
          ko={ko}
          page={paging.page}
          size={paging.size}
          total={view.total ?? view.rows.length}
          disabled={state.kind === "loading"}
          onPageChange={(page) => navigate({}, { page })}
          onSizeChange={(size) => navigate({}, { size, page: 1 })}
        />
      ) : null}

      {forceEnd ? (
        <AdminChatForceEndSheet
          sessionId={forceEnd.id}
          callLabel={`${forceEnd.sessionMode === "group" ? t("admin_cm_call_group") : t("admin_cm_call_direct")} · ${adminChatLabel("call_kind", forceEnd.callKind, ko).label}`}
          initiatorLabel={forceEnd.initiatorLabel}
          participantsLabel={t("admin_chat_calls_participants", { count: forceEnd.participantCount })}
          startedAt={forceEnd.createdAt}
          onClose={() => setForceEnd(null)}
          onSettled={(kind) => {
            setForceEnd(null);
            setResult({
              ok: true,
              message: t(kind === "done" ? "admin_chat_sheet_done" : kind === "stale" ? "admin_chat_sheet_stale" : "admin_chat_sheet_gone"),
            });
            setReloadToken((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function AuditTable({ rows, returnTo }: { rows: AdminChatCallAuditRow[]; returnTo: string }) {
  const { t, language } = useI18n();
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[760px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className={TH}>{t("admin_chat_calls_col_at")}</th>
            <th className={TH}>{t("admin_chat_calls_col_admin")}</th>
            <th className={TH}>{t("admin_cm_modal_reason_code")}</th>
            <th className={TH}>{t("admin_cm_modal_detail_note")}</th>
            <th className={TH}>{t("admin_chat_calls_col_room")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-sam-border/70 align-top last:border-0">
              <td className="px-3 py-2.5 whitespace-nowrap sam-text-body-secondary text-sam-muted">
                {formatAdminDateTime(row.createdAt, language)}
              </td>
              <td className="px-3 py-2.5">{row.actorLabel || "—"}</td>
              <td className="px-3 py-2.5">{row.reasonCode || "—"}</td>
              <td className="px-3 py-2.5 whitespace-pre-wrap">{row.note || "—"}</td>
              <td className="px-3 py-2.5">
                {row.roomId ? (
                  <Link href={adminChatRoomDetailHref(row.roomId, returnTo)} className="text-signature underline">
                    {t("admin_chat_reports_open_room")}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
