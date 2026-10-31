"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { privateRealtimeChannelOptions } from "@/lib/supabase/private-realtime-channel-options";
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
import { AdminSupportStoreInquiriesPanel } from "@/components/admin/support/AdminSupportStoreInquiriesPanel";
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
import {
  resolveSupportCaseContextLinks,
  type SupportAdminContextLink,
} from "@/lib/support/support-reference-admin-href";
import { fetchAdminMeSnapshot, peekAdminMeSnapshot, type AdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { adminListOffsetForPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { AdminTechId, formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import { resolveAdminSupportDetailPane } from "@/lib/support/admin-support-detail-pane";

/** 주소 추가 키 (`tab`·`filter`·`search`·연결 조건은 예전 딥링크와 같은 이름). */
const SUPPORT_LIST_EXTRAS = [
  "tab",
  "audience",
  "group",
  "assignee",
  "stale",
  "search",
  "reference_type",
  "reference_id",
  "store_id",
  "filter",
  // G-07 · G-08 (감사 2026-10-30): 이의신청만(`type=appeal`) · 매장 문의 조회 보기(`view=store_inquiries`)
  "type",
  "view",
] as const;
type SupportListExtra = (typeof SUPPORT_LIST_EXTRAS)[number];

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
      return "bg-sam-danger-soft text-sam-danger border-sam-danger";
    case "WAITING_USER":
      return "bg-sam-warning-soft text-sam-warning border-sam-warning";
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
    <div className="inline-flex flex-wrap gap-1" role="group" data-admin-support-seg={testId}>
      {options.map((o) => (
        <AdminChipButton key={o.id} selected={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </AdminChipButton>
      ))}
    </div>
  );
}

/** 행 선택 — 버튼 부품(높이 고정·한 줄)으로는 여러 줄 행을 그릴 수 없어 키보드 지원 role=button 으로 그린다. */
function SupportQueueRow({
  selected,
  onSelect,
  rowId,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  rowId: string;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`w-full cursor-pointer px-3 py-2.5 text-left hover:bg-sam-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sam-primary ${
        selected ? "bg-sam-primary/10" : ""
      }`}
      data-admin-support-row={rowId}
    >
      {children}
    </div>
  );
}

/** 상담 바로가기 — 링크가 요구하는 권한이 있을 때만 연다 (super_admin 통과). */
function supportLinkAllowed(link: SupportAdminContextLink, me: AdminMeSnapshot | null): boolean {
  const need = link.requiredPermissions;
  if (!need?.length) return true;
  if (!me) return false;
  if (me.role === "super_admin") return true;
  return need.some((k) => me.permissions.includes(k));
}

function AdminSupportPageInner({ initialCaseId }: { initialCaseId?: string }) {
  const { safeT, language, t } = useI18n();
  const ko = language !== "en";
  const [adminMe, setAdminMe] = useState<AdminMeSnapshot | null>(() => peekAdminMeSnapshot());
  useEffect(() => {
    let cancelled = false;
    void fetchAdminMeSnapshot().then((me) => {
      if (!cancelled) setAdminMe(me);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const searchParams = useSearchParams();
  const supportReturnTo = readAdminReturnToFromSearch(searchParams);
  /**
   * R7 — 조건(상태 탭·대상·분야·담당·24h·검색·연결 조건)과 쪽·크기는 주소에 남는다 (새로고침·링크 공유·복귀 유지).
   * 예전 딥링크 키 그대로: `tab` · `filter`(Action Center·대시보드) · `search` · `reference_type`/`reference_id`/`store_id`.
   * 변경할 때마다 현재 조건 전체를 표준 키로 다시 적고 옛 `filter` 는 지운다.
   */
  const lq = useAdminListQuery<SupportListExtra>({ extras: SUPPORT_LIST_EXTRAS, defaults: { size: 50 } });
  const ex = lq.query.extras;
  const legacy = adminSupportTabFromLegacyFilter(ex.filter || null);
  const tabParam = ex.tab.trim().toUpperCase();
  const scope = {
    referenceType: ex.reference_type.trim().toUpperCase() || null,
    referenceId: ex.reference_id.trim() || null,
    storeId: ex.store_id.trim() || null,
  };
  const tab: AdminSupportTab = isAdminSupportTab(tabParam)
    ? tabParam
    : // Domain deep links (주문 상세 · 매장 허브) look for every case of that reference, not only open ones.
      scope.referenceId || scope.storeId
      ? "ALL"
      : legacy.tab;
  const audience: Audience = (["ALL", "MEMBER", "OWNER"] as const).includes(ex.audience as Audience)
    ? (ex.audience as Audience)
    : (legacy.audience ?? "ALL");
  const assignee: Assignee = (["ALL", "ME", "UNASSIGNED"] as const).includes(ex.assignee as Assignee)
    ? (ex.assignee as Assignee)
    : (legacy.assignee ?? "ALL");
  const group = ex.group || "ALL";
  /** 이의신청만 (`type=appeal`) — 분야 미선택이면 전 도메인(거래·커뮤니티) 이의신청 (G-07). */
  const appealOnly = ex.type.trim().toLowerCase() === "appeal";
  /** 매장 문의 조회 보기 (`view=store_inquiries`) — 고객지원 상담과 다른 원장, 조회 전용 (G-08). */
  const storeInquiriesView = ex.view === "store_inquiries";
  const staleOnly = ex.stale === "1";
  /** The query actually sent (주소 `search`); typing settles 300ms first, button/Enter apply at once. */
  const appliedSearch = ex.search;
  const writeSupportQuery = (
    patch: Partial<Record<SupportListExtra, string>>,
    pageOnly?: { page?: number; size?: AdminListPageSize }
  ) => {
    const current: Record<SupportListExtra, string> = {
      tab,
      audience,
      group,
      assignee,
      stale: staleOnly ? "1" : "",
      search: appliedSearch,
      reference_type: scope.referenceType ?? "",
      reference_id: scope.referenceId ?? "",
      store_id: scope.storeId ?? "",
      filter: "",
      type: appealOnly ? "appeal" : "",
      view: storeInquiriesView ? "store_inquiries" : "",
    };
    lq.patch({ ...(pageOnly ?? {}), extras: { ...current, ...patch } });
  };
  const setTab = (v: AdminSupportTab) => writeSupportQuery({ tab: v });
  const setAudience = (v: Audience) => writeSupportQuery({ audience: v });
  const setGroup = (v: string) => writeSupportQuery({ group: v });
  const setAssignee = (v: Assignee) => writeSupportQuery({ assignee: v });
  const setStaleOnly = (v: boolean) => writeSupportQuery({ stale: v ? "1" : "" });
  const setAppealOnly = (v: boolean) => writeSupportQuery({ type: v ? "appeal" : "" });
  const setStoreInquiriesView = (v: boolean) => writeSupportQuery({ view: v ? "store_inquiries" : "" });
  const setAppliedSearch = (v: string) => {
    if (v.trim() !== appliedSearch) writeSupportQuery({ search: v.trim() });
  };
  const clearScope = () => writeSupportQuery({ reference_type: "", reference_id: "", store_id: "" });
  /** 검색 입력 — 주소의 검색어가 바뀌면(뒤로가기·초기화) 다시 맞춘다 (렌더 중 동기화). */
  const [searchDraft, setSearchDraft] = useState({ applied: appliedSearch, value: appliedSearch });
  let search = searchDraft.value;
  if (searchDraft.applied !== appliedSearch) {
    search = appliedSearch;
    setSearchDraft({ applied: appliedSearch, value: appliedSearch });
  }
  const setSearch = (value: string) => setSearchDraft({ applied: appliedSearch, value });

  const [cases, setCases] = useState<SupportCaseAdminDisplayRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<AdminSupportTab, number>>>({});
  const [listError, setListError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listLoaded, setListLoaded] = useState(false);
  // Server-side pagination — page·size 는 주소 (조건이 바뀌면 1쪽으로: useAdminListQuery 규칙).
  const [listTotal, setListTotal] = useState(0);
  const listPage = lq.query.page;
  const listSize = lq.query.size;

  const [activeId, setActiveId] = useState<string | null>(initialCaseId ?? null);
  const [activeCase, setActiveCase] = useState<SupportCaseAdminDisplayRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [composerMode, setComposerMode] = useState<"public" | "internal">("public");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
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
      if (appealOnly) qs.set("type", "appeal");
      if (assignee !== "ALL") qs.set("assignee", assignee);
      if (staleOnly) qs.set("stale", "1");
      if (appliedSearch.trim()) qs.set("search", appliedSearch.trim());
      if (scope.referenceType) qs.set("reference_type", scope.referenceType);
      if (scope.referenceId) qs.set("reference_id", scope.referenceId);
      if (scope.storeId) qs.set("store_id", scope.storeId);
      qs.set("limit", String(listSize));
      qs.set("offset", String(adminListOffsetForPage(listPage, listSize)));
      const res = await fetch(`/api/admin/support/cases?${qs.toString()}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        cases?: SupportCaseAdminDisplayRow[];
        counts?: Partial<Record<AdminSupportTab, number>> | null;
        total?: number;
        error?: string;
      };
      // DEF-07: a failed list call is an error, not an empty queue (keep the last list).
      if (!res.ok || !json.ok) {
        setListError({ code: json.error ?? "load_failed", httpStatus: res.status });
        return;
      }
      setListError(null);
      setListLoaded(true);
      setCases(json.cases ?? []);
      setListTotal(typeof json.total === "number" ? json.total : (json.cases ?? []).length);
      if (json.counts) setCounts(json.counts);
    } catch {
      setListError({ code: "network_error" });
    } finally {
      setListLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 조건은 주소(apiQueryString/refreshKey) 하나로 바뀐다
  }, [lq.refreshKey]);

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

  /** 최신 조건으로 검색어를 적용 (300ms 사이 다른 조건이 바뀌어도 되돌리지 않게 ref 로 최신 함수 사용). */
  const applySearchRef = useRef(setAppliedSearch);
  useEffect(() => {
    applySearchRef.current = setAppliedSearch;
  });
  useEffect(() => {
    const setAppliedSearch = (v: string) => applySearchRef.current(v);
    const t = window.setTimeout(() => setAppliedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (initialCaseId) setActiveId(initialCaseId);
  }, [initialCaseId]);

  useEffect(() => {
    setEditingId(null);
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
      .channel("admin-support-queue", privateRealtimeChannelOptions())
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
    return d?.requester_display_name || d?.requester_email || formatAdminShortId(c.requester_user_id);
  };

  const whoLine = (c: SupportCaseRow) => {
    const role = supportAudienceLabel(c.audience, ko);
    const d = displayFor(c);
    if (c.audience === "OWNER" && c.owner_store_id) {
      const store = d?.owner_store_name || `${ko ? "매장" : "Store"} ${formatAdminShortId(c.owner_store_id)}`;
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

  const filtersActive =
    audience !== "ALL" ||
    group !== "ALL" ||
    appealOnly ||
    assignee !== "ALL" ||
    staleOnly ||
    Boolean(search.trim()) ||
    Boolean(scope.referenceId || scope.storeId);
  /** 「초기화」 — 상태 탭은 그대로 두고 나머지 조건을 기본값으로. */
  const resetFilters = () => {
    setSearch("");
    writeSupportQuery({
      audience: "",
      group: "",
      type: "",
      assignee: "",
      stale: "",
      search: "",
      reference_type: "",
      reference_id: "",
      store_id: "",
    });
  };

  /**
   * 상담 CTA — 동작 종류의 확인 단계(admin-action-levels) 후 기존 PATCH 그대로.
   * 상태 변경(종료·보관·재오픈·보관 해제) = save(L1) · 메시지 삭제 = delete(L3, 사유 → 본문 `reason` → 감사 `after.reason`).
   */
  const confirmThenPatch = async (
    payload: Record<string, unknown>,
    copy: { title: string; description: string; confirmLabel: string; destructive?: boolean; retypeValue?: string },
    kind: AdminActionKind = "save"
  ) => {
    const confirmed = await confirmAdminAction({ level: adminActionLevel(kind), ko, ...copy });
    if (!confirmed.ok) return false;
    return patchCase(confirmed.reason ? { ...payload, reason: confirmed.reason } : payload);
  };

  const groupOptions = [
    { id: "ALL", label: ko ? "전체 분야" : "All topics" },
    ...SUPPORT_CATEGORY_GROUPS.map((g) => ({ id: g.id, label: ko ? g.labelKo : g.labelEn })),
    // G-08: 커뮤니티 도메인 범위 — API `group=COMMUNITY` → 커뮤니티 문의 화면과 같은 범위 필터(parseSupportCaseScope).
    // (「거래」 TRADE 도 서버에서 같은 방식으로 거래 도메인 범위가 된다.)
    { id: "COMMUNITY", label: ko ? "커뮤니티" : "Community" },
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

  const detailPane = resolveAdminSupportDetailPane({
    activeId,
    detailLoading,
    hasActiveCase: Boolean(activeCase),
    error,
  });

  return (
    <div
      className="flex h-full min-h-[600px] flex-col gap-2"
      data-admin-support-ssot="1"
      data-admin-support-console="3col"
    >
      {/* ── Header + status tabs ───────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {t("admin_menu_cp_support_center")}
          </h1>
          <p className="text-xs text-sam-muted">
            {safeT("admin_support_desc", {
              fallbackKo: "회원·사장님 문의 처리",
              fallbackEn: "Member and owner support console",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {supportReturnTo ? (
            <Link href={supportReturnTo} className="text-xs font-semibold text-sam-fg underline">
              {ko ? "← 이전 목록으로" : "← Back to list"}
            </Link>
          ) : null}
          <Link href="/admin/support/archive" className="text-xs text-sam-muted underline">
            {ko ? "이전 문의 기록 (레거시)" : "Legacy archive"}
          </Link>
        </div>
      </div>

      {/* G-08 — 보기 전환: 고객지원 상담(support_cases) | 매장 문의(store_inquiries, 조회 전용). 원장을 합치지 않는다. */}
      <div className="flex flex-wrap items-center gap-1" role="group" data-admin-support-view={storeInquiriesView ? "store_inquiries" : "cases"}>
        <AdminChipButton selected={!storeInquiriesView} onClick={() => setStoreInquiriesView(false)}>
          {ko ? "고객지원 문의" : "Support cases"}
        </AdminChipButton>
        <AdminChipButton selected={storeInquiriesView} onClick={() => setStoreInquiriesView(true)}>
          {ko ? "매장 문의 (조회 전용)" : "Store inquiries (view only)"}
        </AdminChipButton>
      </div>

      {storeInquiriesView ? (
        <AdminSupportStoreInquiriesPanel ko={ko} />
      ) : (
      <>
      <div data-admin-support-tab={tab}>
        <AdminTabs
          ariaLabel={t("admin_menu_cp_support_center")}
          tabs={ADMIN_SUPPORT_TABS.map((id) => ({
            id,
            label: ko ? TAB_LABEL[id].ko : TAB_LABEL[id].en,
            count: typeof counts[id] === "number" ? counts[id] : null,
          }))}
          value={tab}
          syncUrl={false}
          onChange={(id) => {
            setTab(id as AdminSupportTab);
            setActiveId(null);
          }}
        />
      </div>

      {/* ── Secondary filters (표준 필터 바 · 주소 유지) ───────── */}
      <div data-admin-support-filters="1">
        <AdminFilterBar
          ko={ko}
          draft={{ q: search, from: "", to: "" }}
          onDraftChange={(p) => {
            if (p.q !== undefined) setSearch(p.q);
          }}
          onSubmit={() => {
            if (appliedSearch === search.trim()) lq.refresh();
            else setAppliedSearch(search);
          }}
          onReset={resetFilters}
          pending={listLoading}
          showPeriod={false}
          searchPlaceholder={ko ? "SC번호 · 이름 · 이메일 · 매장 · 내용" : "Case no · name · email · store · text"}
        >
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
            className="h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px]"
            data-admin-support-group="1"
            aria-label={ko ? "분야" : "Topic"}
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
          <label className="flex h-10 items-center gap-1 text-[13px] text-sam-fg">
            <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
            {ko ? "24시간 이상" : "24h+"}
          </label>
          <label className="flex h-10 items-center gap-1 text-[13px] text-sam-fg" data-admin-support-appeal="1">
            <input type="checkbox" checked={appealOnly} onChange={(e) => setAppealOnly(e.target.checked)} />
            {ko ? "이의신청만" : "Appeals only"}
          </label>
          {scope.referenceId || scope.storeId ? (
            <AdminChipButton
              selected
              onClick={clearScope}
              title={ko ? "연결 조건 해제" : "Clear linked filter"}
              aria-label={ko ? "연결 조건 해제" : "Clear linked filter"}
            >
              {scope.referenceId
                ? `${scope.referenceType ? supportReferenceLabel(safeT, scope.referenceType) : ko ? "연결 대상" : "Reference"} · ${formatAdminShortId(scope.referenceId)}`
                : `${ko ? "매장" : "Store"} · ${formatAdminShortId(scope.storeId)}`}
              <span aria-hidden>✕</span>
            </AdminChipButton>
          ) : null}
        </AdminFilterBar>
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
          id="action-required"
          className={`${activeId ? "hidden lg:flex" : "flex"} min-h-0 scroll-mt-16 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface`}
          data-admin-support-queue="1"
        >
          <div className="shrink-0 border-b border-sam-border px-3 py-2 text-xs font-semibold text-sam-muted">
            {ko ? TAB_LABEL[tab].ko : TAB_LABEL[tab].en} · {formatAdminNumber(listTotal)}
            {ko ? "건" : ""}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listError ? (
              // DEF-07 · R7 — 오류 상태(코드 + HTTP 상태, 403 은 권한 없음) · 직전 목록은 아래에 그대로.
              <div className="p-2" data-admin-support-list-error="1">
                <AdminErrorState
                  ko={ko}
                  code={listError.code}
                  httpStatus={listError.httpStatus}
                  onRetry={() => void loadList()}
                />
              </div>
            ) : null}
            {listLoading && !listLoaded ? (
              <AdminLoadingState ko={ko} />
            ) : cases.length === 0 ? (
              listError ? null : (
                <AdminEmptyState
                  ko={ko}
                  message={filtersActive ? undefined : ko ? "해당하는 문의가 없습니다" : "No inquiries"}
                  onReset={filtersActive ? resetFilters : undefined}
                />
              )
            ) : (
              <ul className="divide-y divide-sam-border">
                {cases.map((c) => {
                  const unread = Number(c.admin_unread_count) || 0;
                  return (
                    <li key={c.id}>
                      <SupportQueueRow selected={activeId === c.id} onSelect={() => setActiveId(c.id)} rowId={c.id}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-sam-fg">{c.public_case_no}</span>
                          <span className="rounded border border-sam-border px-1 text-[12px] text-sam-muted">
                            {supportAudienceLabel(c.audience, ko)}
                          </span>
                          {unread > 0 ? (
                            <span className="rounded-full bg-sam-danger px-1.5 text-[12px] font-bold text-sam-on-primary tabular-nums">
                              {formatAdminNumber(unread)}
                            </span>
                          ) : null}
                          <span className="ml-auto text-[12px] text-sam-muted">
                            {waitingAgeLabel(c.last_message_at, ko)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] font-medium text-sam-fg">{whoLine(c)}</p>
                        <p className="truncate text-[12px] text-sam-muted">
                          {categoryLabel(c)}
                          {c.issue_type ? ` · ${issueLabel(c)}` : ""}
                        </p>
                        {c.initial_summary ? (
                          <p className="mt-0.5 line-clamp-1 text-[12px] text-sam-fg">{c.initial_summary}</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded border px-1 text-[12px] ${statusTone(c.status)}`}>
                            {supportAdminStatusLabel(c.status, ko)}
                          </span>
                          {c.priority !== "NORMAL" ? (
                            <span className="rounded border border-sam-danger px-1 text-[12px] text-sam-danger">
                              {supportPriorityLabel(c.priority, ko)}
                            </span>
                          ) : null}
                          {!c.assigned_admin_id && c.status !== "RESOLVED" && c.status !== "ARCHIVED" ? (
                            <span className="text-[12px] text-sam-muted">{ko ? "미배정" : "Unassigned"}</span>
                          ) : null}
                        </div>
                      </SupportQueueRow>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {listLoaded ? (
            <div className="shrink-0 border-t border-sam-border px-3" data-admin-support-pager="1">
              <AdminPagination
                ko={ko}
                page={listPage}
                size={listSize}
                total={listTotal}
                disabled={listLoading}
                onPageChange={lq.setPage}
                onSizeChange={lq.setSize}
              />
            </div>
          ) : null}
        </div>

        {/* CENTER — conversation (header / own-scroll timeline / pinned composer) */}
        <div
          className={`${activeId ? "flex" : "hidden lg:flex"} min-h-0 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface`}
          data-admin-support-center="1"
        >
          {detailPane === "empty" ? (
            <p className="m-auto p-6 text-sm text-sam-muted">
              {ko ? "왼쪽 목록에서 문의를 선택하세요" : "Select an inquiry"}
            </p>
          ) : detailPane === "loading" ? (
            <AdminLoadingState ko={ko} />
          ) : detailPane === "error" || !activeCase ? (
            <div className="space-y-2 p-4" role="alert">
              <p className="text-sm text-sam-danger">{supportErrorLabel(safeT, error)}</p>
              <AdminActionButton variant="secondary" size="sm" onClick={() => activeId && void loadDetail(activeId)}>
                {adminCta("refresh", ko)}
              </AdminActionButton>
            </div>
          ) : (
            <>
              <div className="shrink-0 space-y-2 border-b border-sam-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Narrow screens: list ⇄ conversation (no stacked page scroll). */}
                  <AdminActionButton
                    variant="quiet"
                    size="sm"
                    className="lg:hidden"
                    data-admin-support-back="1"
                    onClick={() => setActiveId(null)}
                  >
                    ← {ko ? "목록" : "List"}
                  </AdminActionButton>
                  <h2 className="text-base font-bold text-sam-fg">{activeCase.public_case_no}</h2>
                  <span className={`rounded border px-1.5 text-[12px] ${statusTone(activeCase.status)}`}>
                    {supportAdminStatusLabel(activeCase.status, ko)}
                  </span>
                  {activeCase.priority !== "NORMAL" ? (
                    <span className="rounded border border-sam-danger px-1.5 text-[12px] text-sam-danger">
                      {supportPriorityLabel(activeCase.priority, ko)}
                    </span>
                  ) : null}
                  <span className="text-xs text-sam-muted">
                    {safeT("admin_support_assignee_label", { fallbackKo: "담당자", fallbackEn: "Assignee" })}:{" "}
                    {activeCase.assigned_admin_id
                      ? activeCase.assigned_admin_id === selfAdminId
                        ? safeT("admin_support_assignee_self", { fallbackKo: "나", fallbackEn: "Me" })
                        : <AdminTechId id={activeCase.assigned_admin_id} />
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
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void patchCase({ action: "assign", assigneeAdminId: null })}
                        >
                          {safeT("admin_support_unassign", { fallbackKo: "배정 해제", fallbackEn: "Unassign" })}
                        </AdminActionButton>
                      ) : (
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          disabled={busy || !selfAdminId}
                          data-admin-support-assign-self="1"
                          onClick={() => void patchCase({ action: "assign", assigneeAdminId: selfAdminId })}
                        >
                          {safeT("admin_support_assign_self", { fallbackKo: "나에게 배정", fallbackEn: "Assign to me" })}
                        </AdminActionButton>
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
                  <AdminChipButton
                    selected={showInfo}
                    data-admin-support-info-toggle="1"
                    onClick={() => setShowInfo((v) => !v)}
                  >
                    {ko ? "문의 정보" : "Details"}
                  </AdminChipButton>
                  <div className="ml-auto flex gap-2">
                    {activeOpen ? (
                      // 진행 중 상담의 주 동작은 아래 [답변] — 종료는 보조 (primary 1개).
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void confirmThenPatch(
                            { action: "status", status: "RESOLVED" },
                            {
                              title: safeT("admin_support_resolve", { fallbackKo: "상담 종료", fallbackEn: "Close case" }),
                              description: ko
                                ? `${activeCase.public_case_no} 상담을 종료합니다. 고객에게 종료 상태로 보입니다.`
                                : `Closes ${activeCase.public_case_no}. The customer sees it as closed.`,
                              confirmLabel: safeT("admin_support_resolve", { fallbackKo: "상담 종료", fallbackEn: "Close case" }),
                            }
                          )
                        }
                      >
                        {safeT("admin_support_resolve", { fallbackKo: "상담 종료", fallbackEn: "Close case" })}
                      </AdminActionButton>
                    ) : null}
                    {st === "RESOLVED" ? (
                      <>
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          data-admin-support-archive="1"
                          onClick={() =>
                            void confirmThenPatch(
                              { action: "archive" },
                              {
                                title: ko ? "상담 보관" : "Archive case",
                                description: ko
                                  ? `${activeCase.public_case_no} 상담을 보관함으로 옮깁니다. 「보관 해제」로 되돌릴 수 있습니다.`
                                  : `Moves ${activeCase.public_case_no} to the archive. You can unarchive it later.`,
                                confirmLabel: ko ? "보관" : "Archive",
                              }
                            )
                          }
                        >
                          {ko ? "보관" : "Archive"}
                        </AdminActionButton>
                        <AdminActionButton
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          data-admin-support-reopen="1"
                          onClick={() =>
                            void confirmThenPatch(
                              { action: "reopen" },
                              {
                                title: safeT("admin_support_reopen", { fallbackKo: "재오픈", fallbackEn: "Reopen" }),
                                description: ko
                                  ? `${activeCase.public_case_no} 상담을 다시 엽니다.`
                                  : `Reopens ${activeCase.public_case_no}.`,
                                confirmLabel: safeT("admin_support_reopen", { fallbackKo: "재오픈", fallbackEn: "Reopen" }),
                              }
                            )
                          }
                        >
                          {safeT("admin_support_reopen", { fallbackKo: "재오픈", fallbackEn: "Reopen" })}
                        </AdminActionButton>
                      </>
                    ) : null}
                    {st === "ARCHIVED" ? (
                      <AdminActionButton
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        data-admin-support-unarchive="1"
                        onClick={() =>
                          void confirmThenPatch(
                            { action: "unarchive" },
                            {
                              title: ko ? "보관 해제" : "Unarchive",
                              description: ko
                                ? `${activeCase.public_case_no} 상담을 보관함에서 꺼냅니다.`
                                : `Moves ${activeCase.public_case_no} out of the archive.`,
                              confirmLabel: ko ? "보관 해제" : "Unarchive",
                            }
                          )
                        }
                      >
                        {ko ? "보관 해제" : "Unarchive"}
                      </AdminActionButton>
                    ) : null}
                  </div>
                </div>
                {error ? (
                  <p className="text-xs text-sam-danger" role="alert">
                    {supportErrorLabel(safeT, error)}
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
                    ? "border border-dashed border-sam-warning bg-sam-warning-soft"
                    : system
                      ? "bg-transparent text-sam-muted"
                      : admin
                        ? "bg-sam-primary/10"
                        : "bg-sam-surface border border-sam-border";
                  return (
                    <div key={m.id} className={`max-w-[80%] ${align}`} data-admin-support-msg={m.id}>
                      <div className={`rounded-ui-rect px-3 py-2 text-sm ${tone}`}>
                        <p className="mb-0.5 text-[12px] text-sam-muted">
                          {senderLabel(m)} · {formatAdminManilaDateTime(m.created_at)}
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
                              <AdminActionButton variant="quiet" size="sm" onClick={() => setEditingId(null)}>
                                {adminCta("cancel", ko)}
                              </AdminActionButton>
                              <AdminActionButton
                                variant="secondary"
                                size="sm"
                                disabled={busy || !editDraft.trim()}
                                onClick={async () => {
                                  const ok = await patchCase({
                                    action: "edit_message",
                                    messageId: m.id,
                                    body: editDraft,
                                  });
                                  if (ok) setEditingId(null);
                                }}
                              >
                                {adminCta("save", ko)}
                              </AdminActionButton>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.body}</p>
                        )}
                      </div>
                      {own && editingId !== m.id ? (
                        <div className="mt-0.5 flex justify-end gap-1 text-[12px] text-sam-muted">
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            data-admin-support-msg-edit={m.id}
                            onClick={() => {
                              setEditingId(m.id);
                              setEditDraft(m.body);
                            }}
                          >
                            {adminCta("edit", ko)}
                          </AdminActionButton>
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            data-admin-support-msg-delete={m.id}
                            onClick={() =>
                              void confirmThenPatch(
                                { action: "delete_message", messageId: m.id },
                                {
                                  title: ko ? "메시지 삭제" : "Delete message",
                                  description: ko
                                    ? "내가 보낸 이 메시지를 삭제합니다. 고객에게는 「삭제된 메시지」로 보이고 작업 기록에 남습니다."
                                    : "Deletes your message. The customer sees “Deleted message”; the action is audited.",
                                  confirmLabel: adminCta("delete", ko),
                                  destructive: true,
                                  retypeValue: ko ? "삭제" : "delete",
                                },
                                "delete"
                              )
                            }
                          >
                            {adminCta("delete", ko)}
                          </AdminActionButton>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 border-t border-sam-border p-3" data-admin-support-composer="1">
                <div className="mb-2 inline-flex gap-1" role="group">
                  <AdminChipButton selected={composerMode === "public"} onClick={() => setComposerMode("public")}>
                    {ko ? "공개 답변" : "Public reply"}
                  </AdminChipButton>
                  <AdminChipButton selected={composerMode === "internal"} onClick={() => setComposerMode("internal")}>
                    {safeT("admin_support_internal_note", { fallbackKo: "내부 메모", fallbackEn: "Internal note" })}
                  </AdminChipButton>
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
                        composerMode === "internal" ? "border-sam-warning bg-sam-warning-soft" : "border-sam-border bg-sam-surface"
                      }`}
                    />
                    <AdminActionButton
                      variant="primary"
                      disabled={busy || !draft.trim()}
                      className="shrink-0"
                      onClick={() => void sendComposer()}
                    >
                      {composerMode === "public"
                        ? safeT("admin_support_reply", { fallbackKo: "답변", fallbackEn: "Reply" })
                        : safeT("admin_support_save_note", { fallbackKo: "메모 저장", fallbackEn: "Save note" })}
                    </AdminActionButton>
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
            <AdminActionButton
              variant="quiet"
              size="sm"
              className="mb-2 self-end lg:hidden"
              onClick={() => setShowInfo(false)}
            >
              {adminCta("close", ko)}
            </AdminActionButton>
            <section>
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "고객" : "Customer"}</h3>
              <p className="mt-1 font-medium">{whoName(activeCase)}</p>
              {activeCase.requester_email ? (
                <p className="text-xs text-sam-muted">{activeCase.requester_email}</p>
              ) : null}
              <p className="break-all text-[12px] text-sam-muted">{activeCase.requester_user_id}</p>
            </section>
            {activeCase.owner_store_id ? (
              <section className="mt-3">
                <h3 className="text-xs font-semibold text-sam-muted">{ko ? "매장" : "Store"}</h3>
                <p className="mt-1 font-medium">{activeCase.owner_store_name || "—"}</p>
                <p className="break-all text-[12px] text-sam-muted">{activeCase.owner_store_id}</p>
              </section>
            ) : null}
            <section className="mt-3">
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "문의" : "Inquiry"}</h3>
              <p className="mt-1">
                {categoryLabel(activeCase)}
                {activeCase.issue_type ? ` · ${issueLabel(activeCase)}` : ""}
              </p>
              <p className="mt-1 text-xs text-sam-muted">
                {ko ? "생성" : "Created"}: {formatAdminManilaDateTime(activeCase.created_at)}
              </p>
              <p className="text-xs text-sam-muted">
                {ko ? "최근" : "Last"}: {formatAdminManilaDateTime(activeCase.last_message_at)}
              </p>
            </section>
            <section className="mt-3" data-admin-support-business-ref="1">
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "관련 항목" : "Reference"}</h3>
              {activeCase.reference_type ? (
                <p className="mt-1 text-xs">
                  {supportReferenceLabel(safeT, activeCase.reference_type)}
                  {activeCase.reference_id ? <> · <AdminTechId id={String(activeCase.reference_id)} /></> : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-sam-muted">—</p>
              )}
            </section>
            <section className="mt-3">
              <h3 className="text-xs font-semibold text-sam-muted">{ko ? "바로가기" : "Shortcuts"}</h3>
              <ul className="mt-1 space-y-1" data-admin-support-context-links="1">
                {resolveSupportCaseContextLinks({
                  ownerStoreId: activeCase.owner_store_id,
                  requesterUserId: activeCase.requester_user_id,
                  referenceType: activeCase.reference_type,
                  referenceId: activeCase.reference_id,
                }).map((link) => (
                  <li key={`${link.mutationOwner}:${link.href}`}>
                    {supportLinkAllowed(link, adminMe) ? (
                      <Link
                        href={link.href}
                        className="text-xs font-semibold text-sam-primary underline underline-offset-2"
                        data-admin-support-context-link={link.mutationOwner}
                      >
                        {ko ? link.labelKo : link.labelEn}
                      </Link>
                    ) : (
                      <span className="text-xs text-sam-muted" data-admin-support-context-link-locked={link.mutationOwner}>
                        {ko ? `${link.labelKo} — 권한 필요` : `${link.labelEn} — permission required`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        ) : null}
      </div>
      </>
      )}
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
