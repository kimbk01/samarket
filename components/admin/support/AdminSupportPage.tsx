"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ADMIN_SUPPORT_TABS,
  adminSupportTabFromLegacyFilter,
  isAdminSupportTab,
  type AdminSupportTab,
  type SupportCasePriority,
  type SupportCaseRow,
  type SupportMessageRow,
} from "@/lib/support/support-case-types";
import type { SupportCaseAdminDisplayRow } from "@/lib/support/support-case-service";
import { SUPPORT_CATEGORY_GROUPS } from "@/lib/support/support-category-groups";
import {
  supportAdminStatusLabel,
  supportAudienceLabel,
  supportPriorityLabel,
} from "@/lib/support/support-status-label";
import {
  supportCategoryLabel,
  supportErrorLabel,
  supportIssueLabel,
  supportReferenceLabel,
} from "@/lib/support/support-display-labels";
import { resolveSupportCaseContextLinks } from "@/lib/support/support-reference-admin-href";

/**
 * Admin Support console (Owner-approved redesign 2026-10-05).
 * One screen: status tabs (+counts) → secondary filters → queue | conversation (| info).
 * Queue and conversation scroll independently; the composer is pinned under the conversation,
 * so replying never requires page scroll. Duplicate control-plane card sections removed.
 *
 *  - Tabs = ADMIN_SUPPORT_TABS (status SSOT), filters = audience / SUPPORT_CATEGORY_GROUPS /
 *    assignee / 24h+ / search (case no · name · email · store · first words).
 *  - Case CTAs by state: active → 배정·우선순위·상담 종료 / 종료 → 재오픈·보관 / 보관 → 보관 해제.
 *  - Message CTAs: admin's OWN messages → 수정 / 삭제 (soft, audited; customer sees 삭제된 메시지).
 */

const TAB_LABEL: Record<AdminSupportTab, { ko: string; en: string }> = {
  ACTIONABLE: { ko: "답변 필요", en: "Needs reply" },
  WAITING_USER: { ko: "고객 답변 대기", en: "Waiting customer" },
  RESOLVED: { ko: "종료", en: "Closed" },
  ARCHIVED: { ko: "보관", en: "Archived" },
  ALL: { ko: "전체", en: "All" },
};

const PRIORITIES: readonly SupportCasePriority[] = ["NORMAL", "HIGH", "URGENT"];

type Audience = "ALL" | "MEMBER" | "OWNER";
type Assignee = "ALL" | "ME" | "UNASSIGNED";

function waitingAgeLabel(iso: string, ko: boolean): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (minutes < 60) return ko ? `${Math.max(1, minutes)}분 전` : `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ko ? `${hours}시간 전` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return ko ? `${days}일 전` : `${days}d`;
}

function statusTone(status: string): string {
  switch (status) {
    case "OPEN":
    case "WAITING_ADMIN":
      return "bg-red-50 text-red-700 border-red-200";
    case "WAITING_USER":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "RESOLVED":
      return "bg-sam-surface-muted text-sam-muted border-sam-border";
    default:
      return "bg-sam-surface-muted text-sam-muted border-sam-border";
  }
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-ui-rect border border-sam-border" data-admin-support-seg={testId}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 text-xs font-medium ${
            value === o.id ? "bg-sam-fg text-white" : "bg-sam-surface text-sam-fg hover:bg-sam-surface-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AdminSupportPageInner({ initialCaseId }: { initialCaseId?: string }) {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const initial = useMemo(() => {
    const tabParam = searchParams.get("tab")?.trim().toUpperCase() ?? "";
    if (isAdminSupportTab(tabParam)) return { tab: tabParam, audience: null, assignee: null };
    // Legacy `?filter=` deep links (Action Center, dashboard tile) keep working.
    return adminSupportTabFromLegacyFilter(searchParams.get("filter"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState<AdminSupportTab>(initial.tab);
  const [audience, setAudience] = useState<Audience>(initial.audience ?? "ALL");
  const [group, setGroup] = useState<string>("ALL");
  const [assignee, setAssignee] = useState<Assignee>(initial.assignee ?? "ALL");
  const [staleOnly, setStaleOnly] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search")?.trim() ?? "");
  /** The query actually sent; typing settles 300ms first, button/Enter apply at once. */
  const [appliedSearch, setAppliedSearch] = useState(search);

  const [cases, setCases] = useState<SupportCaseAdminDisplayRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<AdminSupportTab, number>>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(initialCaseId ?? null);
  const [activeCase, setActiveCase] = useState<SupportCaseAdminDisplayRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [composerMode, setComposerMode] = useState<"public" | "internal">("public");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selfAdminId = getCurrentUser()?.id?.trim() || "";
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const qs = new URLSearchParams({ tab });
      if (audience !== "ALL") qs.set("audience", audience);
      if (group !== "ALL") qs.set("group", group);
      if (assignee !== "ALL") qs.set("assignee", assignee);
      if (staleOnly) qs.set("stale", "1");
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      const res = await fetch(`/api/admin/support/cases?${qs.toString()}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        cases?: SupportCaseAdminDisplayRow[];
        counts?: Partial<Record<AdminSupportTab, number>> | null;
        error?: string;
      };
      // DEF-07: a failed list call is an error, not an empty queue (keep the last list).
      if (!res.ok || !json.ok) {
        setListError(json.error ?? `http_${res.status}`);
        return;
      }
      setListError(null);
      setCases(json.cases ?? []);
      if (json.counts) setCounts(json.counts);
    } catch {
      setListError("network_error");
    } finally {
      setListLoading(false);
    }
  }, [tab, audience, group, assignee, staleOnly, appliedSearch]);

  const loadDetail = useCallback(async (caseId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/cases/${encodeURIComponent(caseId)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        case?: SupportCaseAdminDisplayRow;
        messages?: SupportMessageRow[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.case) {
        setError(json.error ?? "load_failed");
        return;
      }
      setActiveCase(json.case);
      setMessages(json.messages ?? []);
    } catch {
      setError("network_error");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const t = window.setTimeout(() => setAppliedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (initialCaseId) setActiveId(initialCaseId);
  }, [initialCaseId]);

  useEffect(() => {
    setEditingId(null);
    setConfirmDeleteId(null);
    setDraft("");
    if (!activeId) {
      setActiveCase(null);
      setMessages([]);
      return;
    }
    void loadDetail(activeId);
  }, [activeId, loadDetail]);

  // Keep the newest message in view (conversation pane scrolls, not the page).
  useEffect(() => {
    const el = timelineRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  /**
   * Queue-wide Realtime: any case's new message or case-row change refreshes the list (300ms
   * coalesced). The conversation reloads only for the open case.
   */
  const activeIdRef = useRef<string | null>(activeId);
  const loadListRef = useRef(loadList);
  useEffect(() => {
    activeIdRef.current = activeId;
    loadListRef.current = loadList;
  });
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    let listTimer: number | null = null;
    const scheduleList = () => {
      if (listTimer != null) window.clearTimeout(listTimer);
      listTimer = window.setTimeout(() => {
        listTimer = null;
        void loadListRef.current();
      }, 300);
    };
    const channel = sb
      .channel("admin-support-queue")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const caseId = String((payload.new as { case_id?: unknown })?.case_id ?? "");
          const open = activeIdRef.current;
          if (open && caseId === open) void loadDetail(open);
          scheduleList();
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "support_cases" }, scheduleList)
      .subscribe();
    return () => {
      if (listTimer != null) window.clearTimeout(listTimer);
      void sb.removeChannel(channel);
    };
  }, [loadDetail]);

  const patchCase = async (payload: Record<string, unknown>) => {
    if (!activeId || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/cases/${encodeURIComponent(activeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "action_failed");
        return false;
      }
      await loadDetail(activeId);
      await loadList();
      return true;
    } catch {
      // DEF-07: non-JSON 5xx / network failure must surface, not fail silently.
      setError("network_error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const categoryLabel = (c: SupportCaseRow) => supportCategoryLabel(safeT, c.category);
  const issueLabel = (c: SupportCaseRow) => supportIssueLabel(safeT, c.category, c.issue_type) ?? "";

  /** DEF-09: member identification (display name · email · store) like the legacy console. */
  const displayFor = (c: SupportCaseRow): SupportCaseAdminDisplayRow | undefined =>
    cases.find((row) => row.id === c.id) ??
    (activeCase && activeCase.id === c.id ? activeCase : undefined);

  const whoName = (c: SupportCaseRow) => {
    const d = displayFor(c);
    return d?.requester_display_name || d?.requester_email || c.requester_user_id.slice(0, 8);
  };

  const whoLine = (c: SupportCaseRow) => {
    const role = supportAudienceLabel(c.audience, ko);
    const d = displayFor(c);
    if (c.audience === "OWNER" && c.owner_store_id) {
      const store = d?.owner_store_name || `${ko ? "매장" : "Store"} ${c.owner_store_id.slice(0, 8)}`;
      return `${whoName(c)} · ${role} · ${store}`;
    }
    return `${whoName(c)} · ${role}`;
  };

  const st = activeCase?.status;
  const activeOpen = st === "OPEN" || st === "WAITING_ADMIN" || st === "WAITING_USER";
  const activeClosed = st === "RESOLVED" || st === "ARCHIVED";

  const sendComposer = async () => {
    const text = draft.trim();
    if (!text) return;
    const ok =
      composerMode === "public"
        ? await patchCase({ action: "reply", body: text })
        : await patchCase({ action: "reply", body: text, internalNote: true });
    if (ok) setDraft("");
  };

  const groupOptions = [
    { id: "ALL", label: ko ? "전체 분야" : "All topics" },
    ...SUPPORT_CATEGORY_GROUPS.map((g) => ({ id: g.id, label: ko ? g.labelKo : g.labelEn })),
  ];

  const senderLabel = (m: SupportMessageRow) => {
    if (m.message_type === "INTERNAL_NOTE") return ko ? "관리자 내부 메모" : "Internal note";
    if (m.sender_type === "SYSTEM") return ko ? "시스템" : "System";
    if (m.sender_type === "ADMIN")
      return m.sender_admin_id && m.sender_admin_id === selfAdminId
        ? ko
          ? "나 (관리자)"
          : "Me (admin)"
        : ko
          ? "관리자"
          : "Admin";
    return activeCase ? whoName(activeCase) : supportAudienceLabel(m.sender_type, ko);
  };

  return (
    <div
      className="flex h-full min-h-[600px] flex-col gap-2"
      data-admin-support-ssot="1"
      data-admin-support-console="3col"
    >
      {/* ── Header + status tabs ───────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-sam-fg">
            {safeT("admin_support_title", { fallbackKo: "고객센터", fallbackEn: "Support Center" })}
          </h1>
          <p className="text-xs text-sam-muted">
            {safeT("admin_support_desc", {
              fallbackKo: "회원·사장님 문의 처리",
              fallbackEn: "Member and owner support console",
            })}
          </p>
        </div>
        <Link href="/admin/support/archive" className="text-xs text-sam-muted underline">
          {ko ? "이전 문의 기록 (레거시)" : "Legacy archive"}
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-sam-border" role="tablist">
        {ADMIN_SUPPORT_TABS.map((t) => {
          const n = counts[t];
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              data-admin-support-tab={t}
              onClick={() => {
                setTab(t);
                setActiveId(null);
              }}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
                on ? "border-sam-fg text-sam-fg" : "border-transparent text-sam-muted hover:text-sam-fg"
              }`}
            >
              {ko ? TAB_LABEL[t].ko : TAB_LABEL[t].en}
              {typeof n === "number" ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                    t === "ACTIONABLE" && n > 0 ? "bg-red-500 text-white" : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ── Secondary filters ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" data-admin-support-filters="1">
        <Seg<Audience>
          testId="audience"
          value={audience}
          onChange={setAudience}
          options={[
            { id: "ALL", label: ko ? "전체" : "All" },
            { id: "MEMBER", label: supportAudienceLabel("MEMBER", ko) },
            { id: "OWNER", label: supportAudienceLabel("OWNER", ko) },
          ]}
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="h-8 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-xs"
          data-admin-support-group="1"
        >
          {groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <Seg<Assignee>
          testId="assignee"
          value={assignee}
          onChange={setAssignee}
          options={[
            { id: "ALL", label: ko ? "담당 전체" : "Any owner" },
            { id: "ME", label: ko ? "내 담당" : "Mine" },
            { id: "UNASSIGNED", label: ko ? "미배정" : "Unassigned" },
          ]}
        />
        <label className="flex items-center gap-1 text-xs text-sam-fg">
          <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
          {ko ? "24시간 이상" : "24h+"}
        </label>
        <div className="ml-auto flex min-w-[220px] flex-1 gap-1 sm:max-w-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setAppliedSearch(search);
            }}
            placeholder={ko ? "SC번호 · 이름 · 이메일 · 매장 · 내용" : "Case no · name · email · store · text"}
            className="h-8 min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-xs"
          />
          <button
            type="button"
            className="h-8 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-xs font-medium"
            onClick={() => {
              if (appliedSearch === search) void loadList();
              else setAppliedSearch(search);
            }}
          >
            {safeT("common_search", { fallbackKo: "검색", fallbackEn: "Search" })}
          </button>
        </div>
      </div>

      {/* ── Queue | Conversation | Info ───────────────────── */}
      <div
        className={`grid min-h-0 flex-1 gap-2 ${
          showInfo && activeCase
            ? "lg:grid-cols-[320px_minmax(0,1fr)_300px]"
            : "lg:grid-cols-[320px_minmax(0,1fr)]"
        }`}
      >
        {/* LEFT — queue (own scroll) */}
        <div
          className={`${activeId ? "hidden lg:flex" : "flex"} min-h-0 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface`}
          data-admin-support-queue="1"
        >
          <div className="shrink-0 border-b border-sam-border px-3 py-2 text-xs font-semibold text-sam-muted">
            {ko ? TAB_LABEL[tab].ko : TAB_LABEL[tab].en} · {cases.length}
            {ko ? "건" : ""}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listError ? (
              <div
                className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                data-admin-support-list-error="1"
              >
                <span>
                  {ko ? "목록을 불러오지 못했습니다" : "Could not load the queue"} ({listError})
                </span>
                <button type="button" className="underline" onClick={() => void loadList()}>
                  {safeT("common_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
                </button>
              </div>
            ) : null}
            {listLoading && cases.length === 0 ? (
              <p className="p-4 text-sm text-sam-muted">…</p>
            ) : cases.length === 0 ? (
              <p className="p-6 text-center text-sm text-sam-muted">
                {ko ? "해당하는 문의가 없습니다" : "No inquiries"}
              </p>
            ) : (
              <ul className="divide-y divide-sam-border">
                {cases.map((c) => {
                  const unread = Number(c.admin_unread_count) || 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(c.id)}
                        className={`w-full px-3 py-2.5 text-left hover:bg-sam-surface-muted ${
                          activeId === c.id ? "bg-sam-primary/10" : ""
                        }`}
                        data-admin-support-row={c.id}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-sam-fg">{c.public_case_no}</span>
                          <span className="rounded border border-sam-border px-1 text-[10px] text-sam-muted">
                            {supportAudienceLabel(c.audience, ko)}
                          </span>
                          {unread > 0 ? (
                            <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                              {unread}
                            </span>
                          ) : null}
                          <span className="ml-auto text-[10px] text-sam-muted">
                            {waitingAgeLabel(c.last_message_at, ko)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] font-medium text-sam-fg">{whoLine(c)}</p>
                        <p className="truncate text-[11px] text-sam-muted">
                          {categoryLabel(c)}
                          {c.issue_type ? ` · ${issueLabel(c)}` : ""}
                        </p>
                        {c.initial_summary ? (
                          <p className="mt-0.5 line-clamp-1 text-[12px] text-sam-fg">{c.initial_summary}</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded border px-1 text-[10px] ${statusTone(c.status)}`}>
                            {supportAdminStatusLabel(c.status, ko)}
                          </span>
                          {c.priority !== "NORMAL" ? (
                            <span className="rounded border border-red-300 px-1 text-[10px] text-red-700">
                              {supportPriorityLabel(c.priority, ko)}
                            </span>
                          ) : null}
                          {!c.assigned_admin_id && c.status !== "RESOLVED" && c.status !== "ARCHIVED" ? (
                            <span className="text-[10px] text-sam-muted">{ko ? "미배정" : "Unassigned"}</span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* CENTER — conversation (header / own-scroll timeline / pinned composer) */}
        <div
          className={`${activeId ? "flex" : "hidden lg:flex"} min-h-0 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface`}
          data-admin-support-center="1"
        >
          {!activeId ? (
            <p className="m-auto p-6 text-sm text-sam-muted">
              {ko ? "왼쪽 목록에서 문의를 선택하세요" : "Select an inquiry"}
            </p>
          ) : detailLoading && !activeCase ? (
            <p className="p-4 text-sm text-sam-muted">…</p>
          ) : !activeCase ? (
            <p className="p-4 text-sm text-red-600">
              {supportErrorLabel(safeT, error)} ({error})
            </p>
          ) : (
            <>
              <div className="shrink-0 space-y-2 border-b border-sam-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Narrow screens: list ⇄ conversation (no stacked page scroll). */}
                  <button
                    type="button"
                    className="rounded border border-sam-border px-2 py-0.5 text-xs lg:hidden"
                    data-admin-support-back="1"
                    onClick={() => setActiveId(null)}
                  >
                    ← {ko ? "목록" : "List"}
                  </button>
                  <h2 className="text-base font-bold text-sam-fg">{activeCase.public_case_no}</h2>
                  <span className={`rounded border px-1.5 text-[11px] ${statusTone(activeCase.status)}`}>
                    {supportAdminStatusLabel(activeCase.status, ko)}
                  </span>
                  {activeCase.priority !== "NORMAL" ? (
                    <span className="rounded border border-red-300 px-1.5 text-[11px] text-red-700">
                      {supportPriorityLabel(activeCase.priority, ko)}
                    </span>
                  ) : null}
                  <span className="text-xs text-sam-muted">
                    {safeT("admin_support_assignee_label", { fallbackKo: "담당자", fallbackEn: "Assignee" })}:{" "}
                    {activeCase.assigned_admin_id
                      ? activeCase.assigned_admin_id === selfAdminId
                        ? safeT("admin_support_assignee_self", { fallbackKo: "나", fallbackEn: "Me" })
                        : `${activeCase.assigned_admin_id.slice(0, 8)}…`
                      : safeT("admin_support_unassigned", { fallbackKo: "미배정", fallbackEn: "Unassigned" })}
                  </span>
                </div>
                <p className="text-sm text-sam-fg">
                  {whoLine(activeCase)} · {categoryLabel(activeCase)}
                  {activeCase.issue_type ? ` · ${issueLabel(activeCase)}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2" data-admin-support-actions="1">
                  {activeOpen ? (
                    <>
                      {activeCase.assigned_admin_id === selfAdminId ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="h-8 rounded-ui-rect border border-sam-border px-3 text-xs font-medium disabled:opacity-50"
                          onClick={() => void patchCase({ action: "assign", assigneeAdminId: null })}
                        >
                          {safeT("admin_support_unassign", { fallbackKo: "배정 해제", fallbackEn: "Unassign" })}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || !selfAdminId}
                          className="h-8 rounded-ui-rect border border-sam-border px-3 text-xs font-medium disabled:opacity-50"
                          data-admin-support-assign-self="1"
                          onClick={() => void patchCase({ action: "assign", assigneeAdminId: selfAdminId })}
                        >
                          {safeT("admin_support_assign_self", { fallbackKo: "나에게 배정", fallbackEn: "Assign to me" })}
                        </button>
                      )}
                      <select
                        value={activeCase.priority}
                        disabled={busy}
                        data-admin-support-priority="1"
                        aria-label={safeT("admin_support_priority_label", { fallbackKo: "우선순위", fallbackEn: "Priority" })}
                        className="h-8 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-xs"
                        onChange={(e) => void patchCase({ action: "priority", priority: e.target.value })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {(ko ? "우선순위 " : "Priority ") + supportPriorityLabel(p, ko)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={`h-8 rounded-ui-rect border px-3 text-xs font-medium ${
                      showInfo ? "border-sam-fg bg-sam-fg text-white" : "border-sam-border"
                    }`}
                    data-admin-support-info-toggle="1"
                    onClick={() => setShowInfo((v) => !v)}
                  >
                    {ko ? "문의 정보" : "Details"}
                  </button>
                  <div className="ml-auto flex gap-2">
                    {activeOpen ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="h-8 rounded-ui-rect bg-sam-fg px-3 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() => void patchCase({ action: "status", status: "RESOLVED" })}
                      >
                        {safeT("admin_support_resolve", { fallbackKo: "상담 종료", fallbackEn: "Close case" })}
                      </button>
                    ) : null}
                    {st === "RESOLVED" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className="h-8 rounded-ui-rect border border-sam-border px-3 text-xs font-medium disabled:opacity-50"
                          data-admin-support-archive="1"
                          onClick={() => void patchCase({ action: "archive" })}
                        >
                          {ko ? "보관" : "Archive"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="h-8 rounded-ui-rect bg-sam-fg px-3 text-xs font-semibold text-white disabled:opacity-50"
                          data-admin-support-reopen="1"
                          onClick={() => void patchCase({ action: "reopen" })}
                        >
                          {safeT("admin_support_reopen", { fallbackKo: "재오픈", fallbackEn: "Reopen" })}
                        </button>
                      </>
                    ) : null}
                    {st === "ARCHIVED" ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="h-8 rounded-ui-rect bg-sam-fg px-3 text-xs font-semibold text-white disabled:opacity-50"
                        data-admin-support-unarchive="1"
                        onClick={() => void patchCase({ action: "unarchive" })}
                      >
                        {ko ? "보관 해제" : "Unarchive"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {error ? (
                  <p className="text-xs text-red-600">
                    {supportErrorLabel(safeT, error)} ({error})
                  </p>
                ) : null}
              </div>

              <div ref={timelineRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-sam-app/40 px-4 py-3">
                {messages.map((m) => {
                  const internal = m.message_type === "INTERNAL_NOTE";
                  const system = m.sender_type === "SYSTEM";
                  const admin = m.sender_type === "ADMIN";
                  const own = admin && !!selfAdminId && m.sender_admin_id === selfAdminId && !m.deleted_at;
                  const align = system ? "mx-auto text-center" : admin ? "ml-auto" : "mr-auto";
                  const tone = internal
                    ? "border border-dashed border-amber-400 bg-amber-50"
                    : system
                      ? "bg-transparent text-sam-muted"
                      : admin
                        ? "bg-sam-primary/10"
                        : "bg-sam-surface border border-sam-border";
                  return (
                    <div key={m.id} className={`max-w-[80%] ${align}`} data-admin-support-msg={m.id}>
                      <div className={`rounded-ui-rect px-3 py-2 text-sm ${tone}`}>
                        <p className="mb-0.5 text-[11px] text-sam-muted">
                          {senderLabel(m)} · {new Date(m.created_at).toLocaleString()}
                          {m.edited_at && !m.deleted_at ? ` · ${ko ? "수정됨" : "edited"}` : ""}
                        </p>
                        {m.deleted_at ? (
                          <p className="text-xs italic text-sam-muted">
                            {ko ? "삭제된 메시지 (고객에게 숨김)" : "Deleted (hidden from customer)"}
                            <span className="ml-1 line-through opacity-60">{m.body}</span>
                          </p>
                        ) : editingId === m.id ? (
                          <div className="space-y-1">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={3}
                              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface p-2 text-sm"
                            />
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="rounded border border-sam-border px-2 py-0.5 text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                {ko ? "취소" : "Cancel"}
                              </button>
                              <button
                                type="button"
                                disabled={busy || !editDraft.trim()}
                                className="rounded bg-sam-fg px-2 py-0.5 text-xs text-white disabled:opacity-50"
                                onClick={async () => {
                                  const ok = await patchCase({
                                    action: "edit_message",
                                    messageId: m.id,
                                    body: editDraft,
                                  });
                                  if (ok) setEditingId(null);
                                }}
                              >
                                {ko ? "저장" : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.body}</p>
                        )}
                      </div>
                      {own && editingId !== m.id ? (
                        <div className="mt-0.5 flex justify-end gap-2 text-[11px] text-sam-muted">
                          {confirmDeleteId === m.id ? (
                            <>
                              <span>{ko ? "삭제할까요?" : "Delete?"}</span>
                              <button
                                type="button"
                                className="font-semibold text-red-600"
                                disabled={busy}
                                data-admin-support-msg-delete-confirm={m.id}
                                onClick={async () => {
                                  const ok = await patchCase({ action: "delete_message", messageId: m.id });
                                  if (ok) setConfirmDeleteId(null);
                                }}
                              >
                                {ko ? "삭제" : "Delete"}
                              </button>
                              <button type="button" onClick={() => setConfirmDeleteId(null)}>
                                {ko ? "취소" : "Cancel"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                data-admin-support-msg-edit={m.id}
                                onClick={() => {
                                  setEditingId(m.id);
                                  setEditDraft(m.body);
                                  setConfirmDeleteId(null);
                                }}
                              >
                                {ko ? "수정" : "Edit"}
                              </button>
                              <button
                                type="button"
                                data-admin-support-msg-delete={m.id}
                                onClick={() => setConfirmDeleteId(m.id)}
                              >
                                {ko ? "삭제" : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 border-t border-sam-border p-3" data-admin-support-composer="1">
                <div className="mb-2 inline-flex overflow-hidden rounded-ui-rect border border-sam-border text-xs">
                  <button
                    type="button"
                    className={`px-3 py-1 font-medium ${composerMode === "public" ? "bg-sam-fg text-white" : "bg-sam-surface"}`}
                    onClick={() => setComposerMode("public")}
                  >
                    {ko ? "공개 답변" : "Public reply"}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 font-medium ${composerMode === "internal" ? "bg-amber-500 text-white" : "bg-sam-surface"}`}
                    onClick={() => setComposerMode("internal")}
                  >
                    {safeT("admin_support_internal_note", { fallbackKo: "내부 메모", fallbackEn: "Internal note" })}
                  </button>
                </div>
                {composerMode === "public" && activeClosed ? (
                  <p
                    className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-xs text-sam-muted"
                    data-admin-support-reply-closed="1"
                  >
                    {ko
                      ? "종료된 상담입니다. 답변하려면 위의 「재오픈」을 누르세요. (내부 메모는 작성 가능)"
                      : "This case is closed. Reopen it to reply. (Internal notes still allowed.)"}
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void sendComposer();
                        }
                      }}
                      rows={3}
                      placeholder={
                        composerMode === "public"
                          ? ko
                            ? "고객에게 보낼 답변 (Ctrl/⌘+Enter 전송)"
                            : "Reply to customer (Ctrl/⌘+Enter)"
                          : ko
                            ? "관리자끼리만 보는 메모 (고객 비노출)"
                            : "Internal note (hidden from customer)"
                      }
                      className={`min-h-[4.5rem] flex-1 rounded-ui-rect border p-2 text-sm ${
                        composerMode === "internal" ? "border-amber-400 bg-amber-50" : "border-sam-border bg-sam-surface"
                      }`}
                    />
                    <button
                      type="button"
                      disabled={busy || !draft.trim()}
                      className={`h-10 shrink-0 rounded-ui-rect px-4 text-sm font-semibold text-white disabled:opacity-50 ${
                        composerMode === "internal" ? "bg-amber-500" : "bg-sam-primary"
                      }`}
                      onClick={() => void sendComposer()}
                    >
                      {composerMode === "public"
                        ? safeT("admin_support_reply", { fallbackKo: "답변", fallbackEn: "Reply" })
                        : safeT("admin_support_save_note", { fallbackKo: "메모 저장", fallbackEn: "Save note" })}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT — inquiry info (toggle) */}
        {showInfo && activeCase ? (
          <aside
            className="fixed inset-y-0 right-0 z-40 flex w-[300px] max-w-[85vw] flex-col overflow-y-auto border-l border-sam-border bg-sam-surface p-3 text-sm shadow-xl lg:static lg:z-auto lg:w-auto lg:max-w-none lg:rounded-ui-rect lg:border lg:shadow-none"
            data-admin-support-context="1"
          >
            <button
              type="button"
              className="mb-2 self-end text-xs text-sam-muted underline lg:hidden"
              onClick={() => setShowInfo(false)}
            >
              {ko ? "닫기" : "Close"}
            </button>
            <section>
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "고객" : "Customer"}</h3>
              <p className="mt-1 font-medium">{whoName(activeCase)}</p>
              {activeCase.requester_email ? (
                <p className="text-xs text-sam-muted">{activeCase.requester_email}</p>
              ) : null}
              <p className="break-all text-[11px] text-sam-muted">{activeCase.requester_user_id}</p>
            </section>
            {activeCase.owner_store_id ? (
              <section className="mt-3">
                <h3 className="text-xs font-semibold text-sam-muted">{ko ? "매장" : "Store"}</h3>
                <p className="mt-1 font-medium">{activeCase.owner_store_name || "—"}</p>
                <p className="break-all text-[11px] text-sam-muted">{activeCase.owner_store_id}</p>
              </section>
            ) : null}
            <section className="mt-3">
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "문의" : "Inquiry"}</h3>
              <p className="mt-1">
                {categoryLabel(activeCase)}
                {activeCase.issue_type ? ` · ${issueLabel(activeCase)}` : ""}
              </p>
              <p className="mt-1 text-xs text-sam-muted">
                {ko ? "생성" : "Created"}: {new Date(activeCase.created_at).toLocaleString()}
              </p>
              <p className="text-xs text-sam-muted">
                {ko ? "최근" : "Last"}: {new Date(activeCase.last_message_at).toLocaleString()}
              </p>
            </section>
            <section className="mt-3" data-admin-support-business-ref="1">
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "관련 항목" : "Reference"}</h3>
              {activeCase.reference_type ? (
                <p className="mt-1 text-xs">
                  {supportReferenceLabel(safeT, activeCase.reference_type)}
                  {activeCase.reference_id ? ` · ${String(activeCase.reference_id).slice(0, 12)}…` : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-sam-muted">—</p>
              )}
            </section>
            <section className="mt-3">
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "바로가기" : "Shortcuts"}</h3>
              <ul className="mt-1 space-y-1">
                {resolveSupportCaseContextLinks({
                  ownerStoreId: activeCase.owner_store_id,
                  requesterUserId: activeCase.requester_user_id,
                  referenceType: activeCase.reference_type,
                  referenceId: activeCase.reference_id,
                }).map((link) => (
                  <li key={`${link.mutationOwner}:${link.href}`}>
                    <Link
                      href={link.href}
                      className="text-xs font-semibold text-sam-primary underline underline-offset-2"
                      data-admin-support-context-link={link.mutationOwner}
                    >
                      {ko ? link.labelKo : link.labelEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function AdminSupportPage({ initialCaseId }: { initialCaseId?: string }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminSupportPageInner initialCaseId={initialCaseId} />
    </Suspense>
  );
}
