"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  adminSupportErrorLabel,
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
import {
  isAdminSupportDetailResponseCurrent,
  pickAdminSupportShownDetail,
  resolveAdminSupportDetailPane,
  resolveAdminSupportWriteTarget,
  type AdminSupportLoadedDetail as AdminSupportLoadedDetailOf,
} from "@/lib/support/admin-support-detail-pane";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveSupportMessageDisplayBody } from "@/lib/support/support-seed-message-text";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { ADMIN_SUPPORT_TAB_LABEL_KEY, adminSupportStatusTone } from "@/components/admin/support/admin-support-status";
import {
  ADMIN_SUPPORT_OWN_WRITE_GRACE_MS,
  ADMIN_SUPPORT_OFF_LIST_REFRESH_MS,
  isOffListSupportCaseUpdate,
  isAdminSupportOwnWriteEcho,
  shouldRefetchSupportListForCaseChange,
  subscribeAdminSupportAlertCreated,
  subscribeAdminSupportCaseChange,
  subscribeAdminSupportMessageInsert,
  type AdminSupportOwnWrite,
} from "@/components/admin/support/admin-support-realtime";
import {
  adminSupportSeenKey,
  buildAdminSupportInternalNotePayload,
  buildAdminSupportPublicReplyPayload,
  buildAdminSupportResolvePayload,
  buildAdminSupportSeenPayload,
  resolveAdminSupportReplyIntent,
  type AdminSupportReplyIntent,
} from "@/components/admin/support/admin-support-reply";

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

const PRIORITIES: readonly SupportCasePriority[] = ["NORMAL", "HIGH", "URGENT"];

type AdminSupportLoadedDetail = AdminSupportLoadedDetailOf<SupportCaseAdminDisplayRow, SupportMessageRow>;
const NO_MESSAGES: SupportMessageRow[] = [];
/** 점검 U10: 좁은 화면(lg 미만)에서 주 동작(답변·상담 종료·재오픈)은 누르는 높이 44px — 공통 버튼 크기는 그대로 */
const ADMIN_SUPPORT_NARROW_PRIMARY_TAP_CLASS = "min-h-11 lg:min-h-0";
const NO_FOLLOWUPS: Record<string, string> = {};

type Audience = "ALL" | "MEMBER" | "OWNER";
type Assignee = "ALL" | "ME" | "UNASSIGNED";

function waitingAgeLabel(iso: string, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return t("admin_support_mins_ago", { minutes: Math.max(1, minutes) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("admin_support_hours_ago", { hours });
  const days = Math.floor(hours / 24);
  return t("admin_support_days_ago", { days });
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
  disabled = false,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  rowId: string;
  /** 병합 전 2차 1: 저장 중에는 다른 문의로 바꿀 수 없다(저장 결과·실패 안내가 그 문의 화면에 뜨도록) */
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-disabled={disabled ? "true" : undefined}
      data-admin-support-row-disabled={disabled ? "1" : undefined}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`w-full px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sam-primary ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-sam-surface-muted"
      } ${selected ? "bg-sam-primary/10" : ""}`}
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
  /**
   * 점검 H1: 상세(문의·글·세부)는 「어느 문의의 것인지」와 한 덩어리로 둔다.
   * 화면·저장은 `detail.caseId === activeId` 일 때만 그 상세를 쓴다 — 다른 문의를 누르면 즉시 「불러오는 중」.
   */
  const [detail, setDetail] = useState<AdminSupportLoadedDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const shownDetail = pickAdminSupportShownDetail(detail, activeId);
  const activeCase = shownDetail?.case ?? null;
  const messages = shownDetail?.messages ?? NO_MESSAGES;
  /** 재감사 D8: 진행 중 문의에 이어 붙은 접수에서 고객이 고른 세부 (글 id → 세부) */
  const followupIssues = shownDetail?.followupIssues ?? NO_FOLLOWUPS;
  /** 상세 요청 순번 — 늦게 온 옛 응답(다른 문의·같은 문의의 이전 요청)은 버린다 */
  const detailSeqRef = useRef(0);
  const listSeqRef = useRef(0);
  const activeIdRef = useRef<string | null>(activeId);
  /** 화면에 보이는 문의 id — 확인 창을 기다리는 사이 다른 문의로 바뀌었는지 저장 직전에 본다 */
  const shownCaseIdRef = useRef<string | null>(activeCase?.id ?? null);
  const [showInfo, setShowInfo] = useState(false);

  const [composerMode, setComposerMode] = useState<"public" | "internal">("public");
  const [draft, setDraft] = useState("");
  /** 재감사 8: 실시간 다시 읽기 때 직전 상세·쓰는 중인 답과 비교 */
  const detailRef = useRef<AdminSupportLoadedDetail | null>(null);
  const draftRef = useRef("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** 저장 중 표시의 즉시 값 — 같은 렌더 안 두 번 누름(연타)도 막는다(state 는 다음 렌더에야 바뀜) */
  const busyRef = useRef(false);
  /** 계약 §1 S-3: 마지막으로 보낸(아직 성공 못 한) 답 — 같은 본문 재시도 = 같은 requestId */
  const replyIntentRef = useRef<AdminSupportReplyIntent | null>(null);
  /** 마지막 저장 실패 코드 — `request_id_conflict` 면 다음 전송에 새 requestId */
  const lastPatchErrorRef = useRef<string | null>(null);
  /** 계약 §3 A-1: 이미 읽음 요청을 보낸 상세(문의·보여 준 글) — 같은 화면에 2번 보내지 않는다 */
  const seenSentKeyRef = useRef<string | null>(null);
  /**
   * 재감사 3: 열린 문의에 내 알림 행이 읽음(seen) 뒤에 새로 생김 — 같은 상세라도 읽음을 1번 더 보낸다.
   * 값 = 그 문의 id (탭이 숨어 있으면 보일 때까지 기다린다). 이 경우에만 같은 상세 재전송을 허용한다.
   */
  const seenResendCaseRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selfAdminId = getCurrentUser()?.id?.trim() || "";
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    // 재감사(PR #687) 1: 가장 최근 목록 요청의 응답만 그린다(탭·조건을 바꾼 뒤 늦게 온 옛 응답이 덮지 않게)
    const seq = ++listSeqRef.current;
    const isLatest = () => seq === listSeqRef.current;
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
      if (!isLatest()) return;
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
      if (isLatest()) setListError({ code: "network_error" });
    } finally {
      if (isLatest()) setListLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 조건은 주소(apiQueryString/refreshKey) 하나로 바뀐다
  }, [lq.refreshKey]);

  const loadDetail = useCallback(async (caseId: string) => {
    const seq = ++detailSeqRef.current;
    const stillCurrent = () =>
      isAdminSupportDetailResponseCurrent({
        requestSeq: seq,
        latestSeq: detailSeqRef.current,
        requestCaseId: caseId,
        activeId: activeIdRef.current,
      });
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
        followupIssues?: { messageId: string; issueType: string }[];
        error?: string;
      };
      if (!stillCurrent()) return;
      if (!res.ok || !json.ok || !json.case || json.case.id !== caseId) {
        setError(json.error ?? "load_failed");
        return;
      }
      // 재감사 8: 답을 쓰는 동안 같은 문의에 새 고객 글이 화면에 나타나면 알린다(보낼 때 화면에 보이던 글 = 본 글)
      const prev = detailRef.current;
      if (prev && prev.caseId === caseId && draftRef.current.trim()) {
        const known = new Set(prev.messages.map((m) => m.id));
        const arrived = (json.messages ?? []).some(
          (m) => !known.has(m.id) && m.message_type === "PUBLIC" && m.sender_type !== "ADMIN"
        );
        if (arrived) setError("reply_unseen_customer_messages");
      }
      setDetail({
        caseId,
        case: json.case,
        messages: json.messages ?? [],
        followupIssues: Object.fromEntries((json.followupIssues ?? []).map((f) => [f.messageId, f.issueType])),
      });
    } catch {
      if (stillCurrent()) setError("network_error");
    } finally {
      if (seq === detailSeqRef.current) setDetailLoading(false);
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
    // 점검 H1: 다른 문의를 누르면 이전 상세·오류·진행 중 요청을 즉시 버린다
    activeIdRef.current = activeId;
    // 재감사 3: 다른 문의로 바꾸면 이전 문의의 「읽음 다시 보내기」 예약은 버린다
    if (seenResendCaseRef.current !== activeId) seenResendCaseRef.current = null;
    setEditingId(null);
    setDraft("");
    setError(null);
    setDetail((prev) => (prev && prev.caseId === activeId ? prev : null));
    if (!activeId) {
      detailSeqRef.current += 1;
      setDetailLoading(false);
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
   * Queue-wide Realtime: a new message, or a case change that the list shows (최종 감사 D6 —
   * `shouldRefetchSupportListForCaseChange`: 읽음 숫자 같은 변경은 다시 읽지 않는다), refreshes the list
   * (300ms coalesced). The conversation reloads only for the open case.
   * 내가 방금 보낸 변경의 실시간 메아리는 건너뛴다 — patchCase 가 상세·목록을 이미 다시 읽는다.
   */
  const loadListRef = useRef(loadList);
  const casesRef = useRef(cases);
  const tabRef = useRef(tab);
  const ownWriteRef = useRef<AdminSupportOwnWrite>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
    shownCaseIdRef.current = activeCase?.id ?? null;
    detailRef.current = detail;
    draftRef.current = draft;
    loadListRef.current = loadList;
    casesRef.current = cases;
    tabRef.current = tab;
  });
  useEffect(() => {
    let listTimer: number | null = null;
    let slowTimer: number | null = null;
    let lastListAt = Date.now();
    const scheduleList = () => {
      if (listTimer != null) window.clearTimeout(listTimer);
      if (slowTimer != null) {
        window.clearTimeout(slowTimer);
        slowTimer = null;
      }
      listTimer = window.setTimeout(() => {
        listTimer = null;
        lastListAt = Date.now();
        void loadListRef.current();
      }, 300);
    };
    // 재감사 D6-a: 목록 밖 문의 변경 → 탭 숫자 맞춤용으로 30초에 1번만
    const scheduleSlowList = () => {
      if (slowTimer != null || listTimer != null) return;
      const wait = Math.max(0, lastListAt + ADMIN_SUPPORT_OFF_LIST_REFRESH_MS - Date.now());
      slowTimer = window.setTimeout(() => {
        slowTimer = null;
        lastListAt = Date.now();
        void loadListRef.current();
      }, wait);
    };
    // 점검 L13: support_messages INSERT 는 공통 구독(AdminStorePointPendingProvider)만 받고 이 창 이벤트로 넘겨준다.
    const unsubscribeMessages = subscribeAdminSupportMessageInsert(({ caseId, senderAdminId }) => {
      const echo = isAdminSupportOwnWriteEcho({
        ownWrite: ownWriteRef.current,
        caseId,
        now: Date.now(),
        kind: "message",
        senderAdminId,
        selfAdminId: getCurrentUser()?.id ?? null,
      });
      if (echo) return;
      // 점검 H1: 열린 문의만 다시 읽고, 응답은 loadDetail 의 순번·문의 대조를 거친다
      const open = activeIdRef.current;
      if (open && caseId === open) void loadDetail(open);
      // 재감사 6: 목록 값(상태·마지막 글·미읽음)은 같은 트랜잭션의 support_cases UPDATE 로 오고 아래에서 거른다 — 여기서 목록을 다시 읽지 않는다
    });
    // 전체 수정 계약 §4 B-5: support_cases 도 공통 구독(AdminStorePointPendingProvider) 한 곳만 받고 이 창 이벤트로 넘겨준다.
    const unsubscribeCases = subscribeAdminSupportCaseChange((payload) => {
      const { newRow, oldRow } = payload;
      const caseId = String(newRow?.id ?? oldRow?.id ?? "");
      if (
        isAdminSupportOwnWriteEcho({ ownWrite: ownWriteRef.current, caseId, now: Date.now(), kind: "case" })
      ) {
        return;
      }
      // 병합 전 L2: 다른 어드민이 **열린 문의**의 상태·담당을 바꿨으면 상세도 다시 읽는다(종료된 문의에 답 칸이 남지 않게)
      const shownCase = detailRef.current?.caseId === caseId ? detailRef.current.case : null;
      if (
        shownCase &&
        caseId === activeIdRef.current &&
        newRow &&
        (String(newRow.status ?? "") !== String(shownCase.status ?? "") ||
          String(newRow.assigned_admin_id ?? "") !== String(shownCase.assigned_admin_id ?? ""))
      ) {
        void loadDetail(caseId);
      }
      if (
        shouldRefetchSupportListForCaseChange({
          eventType: payload.eventType,
          newRow,
          oldRow,
          listed: casesRef.current,
          tab: tabRef.current,
        })
      ) {
        scheduleList();
      } else if (isOffListSupportCaseUpdate({ eventType: payload.eventType, newRow, listed: casesRef.current })) {
        scheduleSlowList();
      }
    });
    return () => {
      unsubscribeMessages();
      unsubscribeCases();
      if (listTimer != null) window.clearTimeout(listTimer);
      if (slowTimer != null) window.clearTimeout(slowTimer);
    };
  }, [loadDetail]);

  /**
   * 전체 수정 계약 §3 A-1: 읽음 = 화면에 보인 것. 상세 GET 은 읽기만 하고, 읽음은 별도 요청(`action: "seen"`)으로 —
   * 이 탭이 보이고(`visibilityState === "visible"`) · 그 문의가 지금 열린 문의이고 · 그 상세가 그려진 뒤에만 보낸다.
   * 탭이 숨은 사이 실시간으로 다시 읽은 상세는 다시 보일 때(visibilitychange) 보낸다. 같은 상세에는 1번만.
   */
  const sendSeenIfVisible = useCallback(() => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    const shown = detailRef.current;
    const open = activeIdRef.current;
    if (!shown || !open || shown.caseId !== open || shown.case.id !== open) return;
    const payload = buildAdminSupportSeenPayload(shown.messages, shown.case.last_message_at);
    const key = adminSupportSeenKey(open, payload);
    const resend = seenResendCaseRef.current === open;
    if (seenSentKeyRef.current === key && !resend) return;
    seenResendCaseRef.current = null;
    seenSentKeyRef.current = key;
    const forget = () => {
      // 실패하면 다음 상세·다시 보일 때 다시 보낸다(반복 재시도 없음)
      if (seenSentKeyRef.current === key) seenSentKeyRef.current = null;
    };
    void (async () => {
      try {
        const res = await fetch(`/api/admin/support/cases/${encodeURIComponent(open)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        // 헤더 받은 알림 숫자는 내 알림 행 실시간(공통 구독) 하나로만 바뀐다 — 여기서 따로 신호를 보내지 않는다
        if (res.ok && json.ok) return;
        forget();
      } catch {
        forget();
      }
    })();
  }, []);
  useEffect(() => {
    sendSeenIfVisible();
  }, [detail, activeId, sendSeenIfVisible]);
  useEffect(() => {
    const onVisibility = () => sendSeenIfVisible();
    document.addEventListener("visibilitychange", onVisibility);
    // 재감사 3: 알림 행이 읽음보다 늦게 생김(응답 뒤·outbox) — 열린 문의면 지금 그려진 상세로 읽음을 다시 보낸다(숨어 있으면 보일 때)
    const unsubscribeAlerts = subscribeAdminSupportAlertCreated(({ caseId }) => {
      if (!caseId || caseId !== activeIdRef.current) return;
      seenResendCaseRef.current = caseId;
      sendSeenIfVisible();
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeAlerts();
    };
  }, [sendSeenIfVisible]);

  /**
   * 점검 H1: 저장은 「누를 때 화면에 보이던 문의」(`expectedCaseId`)로만 보낸다.
   * 그 사이 다른 문의를 눌렀거나 상세가 아직 그 문의 것이 아니면 보내지 않는다.
   */
  const patchCase = async (payload: Record<string, unknown>, expectedCaseId: string | null | undefined) => {
    const writeCaseId = resolveAdminSupportWriteTarget({
      expectedCaseId,
      activeId: activeIdRef.current,
      shownCaseId: shownCaseIdRef.current,
    });
    if (!writeCaseId || busyRef.current) return false;
    busyRef.current = true;
    lastPatchErrorRef.current = null;
    setBusy(true);
    setError(null);
    // 진행 중에는 끝없이, 끝난 뒤 잠깐 — 그 사이 같은 문의의 내 변경 실시간 메아리는 다시 읽지 않는다 (D6).
    ownWriteRef.current = { caseId: writeCaseId, until: Number.POSITIVE_INFINITY };
    try {
      const res = await fetch(`/api/admin/support/cases/${encodeURIComponent(writeCaseId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        unseenCustomerMessages?: number;
        /** 계약 §1: 같은 requestId 의 답이 이미 저장됨 — 처음 결과(새로 쓰지 않음), 성공과 같게 다룬다 */
        replayed?: boolean;
      };
      // 재감사 1·2: 그사이 다른 문의를 눌렀으면 저장한 문의의 상세를 다시 읽지 않고(열린 문의 응답이 버려져 멈춤) 결과 문구도 띄우지 않는다
      const stillOpen = activeIdRef.current === writeCaseId;
      if (!res.ok || !json.ok) {
        const code = json.error ?? "action_failed";
        lastPatchErrorRef.current = code;
        // 점검 M6 · 병합 전 L2: 문의가 그사이 바뀌었다(고객 새 글·다른 어드민의 종료·상태 변경) — 상세를 다시 읽고 안내를 남긴다
        if (stillOpen && ADMIN_SUPPORT_RELOAD_ON_ERROR.has(code)) await loadDetail(writeCaseId);
        if (stillOpen) setError(code);
        return false;
      }
      if (stillOpen) await loadDetail(writeCaseId);
      // 재감사(PR #687) 1: 누를 때의 옛 조건이 아니라 지금 탭·조건으로 다시 읽는다
      await loadListRef.current();
      // 재감사 D1-b: 답을 쓰는 사이 고객 글이 더 왔다 — 문의는 「답변 필요」에 남았다는 것을 알린다
      if (stillOpen && Number(json.unseenCustomerMessages ?? 0) > 0) setError("reply_unseen_customer_messages");
      return true;
    } catch {
      // DEF-07: non-JSON 5xx / network failure must surface, not fail silently.
      lastPatchErrorRef.current = "network_error";
      if (activeIdRef.current === writeCaseId) setError("network_error");
      return false;
    } finally {
      ownWriteRef.current = { caseId: writeCaseId, until: Date.now() + ADMIN_SUPPORT_OWN_WRITE_GRACE_MS };
      busyRef.current = false;
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
    const role = supportAudienceLabel(c.audience, t);
    const d = displayFor(c);
    if (c.audience === "OWNER" && c.owner_store_id) {
      const store = d?.owner_store_name || `${t("common_store")} ${formatAdminShortId(c.owner_store_id)}`;
      return `${whoName(c)} · ${role} · ${store}`;
    }
    return `${whoName(c)} · ${role}`;
  };

  const st = activeCase?.status;
  const activeOpen = st === "OPEN" || st === "WAITING_ADMIN" || st === "WAITING_USER";
  const activeClosed = st === "RESOLVED" || st === "ARCHIVED";

  const sendComposer = async () => {
    const text = draft.trim();
    if (!text || !activeCase) return;
    if (busyRef.current) return;
    const sentCaseId = activeCase.id;
    // 계약 §1 S-3: 실패 뒤 같은 본문을 다시 보내면 같은 requestId(서버 replay = 답변·푸시 1번), 본문이 바뀌면 새 id
    const intent = resolveAdminSupportReplyIntent(replyIntentRef.current, {
      caseId: sentCaseId,
      mode: composerMode,
      body: text,
    });
    replyIntentRef.current = intent;
    const ok =
      composerMode === "public"
        ? await patchCase(
            buildAdminSupportPublicReplyPayload(text, activeCase.last_message_at, intent.requestId),
            activeCase.id
          )
        : await patchCase(buildAdminSupportInternalNotePayload(text, intent.requestId), activeCase.id);
    // 성공 = 끝난 요청 · request_id_conflict = 그 id 는 다른 글 것 — 둘 다 다음 전송은 새 id
    if ((ok || lastPatchErrorRef.current === "request_id_conflict") && replyIntentRef.current === intent) {
      replyIntentRef.current = null;
    }
    // 재감사 3: 그사이 다른 문의로 바꿨으면 그 문의에 쓰는 답을 지우지 않는다
    if (ok && activeIdRef.current === sentCaseId) setDraft("");
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
    const expectedCaseId = activeCase?.id ?? null;
    if (!expectedCaseId) return false;
    const confirmed = await confirmAdminAction({ level: adminActionLevel(kind), ko, ...copy });
    if (!confirmed.ok) return false;
    return patchCase(confirmed.reason ? { ...payload, reason: confirmed.reason } : payload, expectedCaseId);
  };

  const groupOptions = [
    { id: "ALL", label: t("admin_support_all_topics") },
    ...SUPPORT_CATEGORY_GROUPS.map((g) => ({ id: g.id, label: t(g.labelKey) })),
    // G-08: 커뮤니티 도메인 범위 — API `group=COMMUNITY` → 커뮤니티 문의 화면과 같은 범위 필터(parseSupportCaseScope).
    // (「거래」 TRADE 도 서버에서 같은 방식으로 거래 도메인 범위가 된다.)
    { id: "COMMUNITY", label: t("admin_support_community") },
  ];

  const senderLabel = (m: SupportMessageRow) => {
    if (m.message_type === "INTERNAL_NOTE") return t("admin_support_internal_note_2");
    if (m.sender_type === "SYSTEM") return t("admin_support_system");
    if (m.sender_type === "ADMIN")
      return m.sender_admin_id && m.sender_admin_id === selfAdminId
        ? t("admin_support_me_admin")
        : t("admin_support_admin");
    return activeCase ? whoName(activeCase) : supportAudienceLabel(m.sender_type, t);
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
            {safeT("admin_support_desc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {supportReturnTo ? (
            <Link href={supportReturnTo} className="text-xs font-semibold text-sam-fg underline">
              {t("admin_support_back_to_list")}
            </Link>
          ) : null}
          <Link href="/admin/support/archive" className="text-xs text-sam-muted underline">
            {t("admin_support_legacy_archive")}
          </Link>
        </div>
      </div>

      {/* G-08 — 보기 전환: 고객지원 상담(support_cases) | 매장 문의(store_inquiries, 조회 전용). 원장을 합치지 않는다. */}
      <div className="flex flex-wrap items-center gap-1" role="group" data-admin-support-view={storeInquiriesView ? "store_inquiries" : "cases"}>
        <AdminChipButton selected={!storeInquiriesView} onClick={() => setStoreInquiriesView(false)}>
          {t("admin_support_support_cases")}
        </AdminChipButton>
        <AdminChipButton selected={storeInquiriesView} onClick={() => setStoreInquiriesView(true)}>
          {t("admin_support_store_inquiries_view_only")}
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
            label: t(ADMIN_SUPPORT_TAB_LABEL_KEY[id]),
            count: typeof counts[id] === "number" ? counts[id] : null,
          }))}
          value={tab}
          syncUrl={false}
          onChange={(id) => {
            setTab(id as AdminSupportTab);
            // 병합 전 2차 1: 저장 중이면 열린 문의를 닫지 않는다(결과·실패 안내가 사라지지 않게)
            if (!busy) setActiveId(null);
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
          searchPlaceholder={t("admin_support_case_no_name_email_store_text")}
        >
          <Seg<Audience>
            testId="audience"
            value={audience}
            onChange={setAudience}
            options={[
              { id: "ALL", label: t("common_all") },
              { id: "MEMBER", label: supportAudienceLabel("MEMBER", t) },
              { id: "OWNER", label: supportAudienceLabel("OWNER", t) },
            ]}
          />
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px]"
            data-admin-support-group="1"
            aria-label={t("admin_support_topic")}
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
              { id: "ALL", label: t("admin_support_any_owner") },
              { id: "ME", label: t("admin_support_mine") },
              { id: "UNASSIGNED", label: t("admin_support_filter_unassigned") },
            ]}
          />
          <label className="flex h-10 items-center gap-1 text-[13px] text-sam-fg">
            <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
            {t("admin_support_24h")}
          </label>
          <label className="flex h-10 items-center gap-1 text-[13px] text-sam-fg" data-admin-support-appeal="1">
            <input type="checkbox" checked={appealOnly} onChange={(e) => setAppealOnly(e.target.checked)} />
            {t("admin_support_appeals_only")}
          </label>
          {scope.referenceId || scope.storeId ? (
            <AdminChipButton
              selected
              onClick={clearScope}
              title={t("admin_support_clear_linked_filter")}
              aria-label={t("admin_support_clear_linked_filter")}
            >
              {scope.referenceId
                ? `${scope.referenceType ? supportReferenceLabel(safeT, scope.referenceType) : t("admin_support_reference")} · ${formatAdminShortId(scope.referenceId)}`
                : `${t("common_store")} · ${formatAdminShortId(scope.storeId)}`}
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
            {t(ADMIN_SUPPORT_TAB_LABEL_KEY[tab])} · {t("admin_count_items", { n: formatAdminNumber(listTotal) })}
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
                  message={filtersActive ? undefined : t("admin_support_no_inquiries")}
                  onReset={filtersActive ? resetFilters : undefined}
                />
              )
            ) : (
              <ul className="divide-y divide-sam-border">
                {cases.map((c) => {
                  const unread = Number(c.admin_unread_count) || 0;
                  return (
                    <li key={c.id}>
                      <SupportQueueRow
                        selected={activeId === c.id}
                        onSelect={() => setActiveId(c.id)}
                        rowId={c.id}
                        disabled={busy && activeId !== c.id}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-sam-fg">{c.public_case_no}</span>
                          <span className="rounded border border-sam-border px-1 text-[12px] text-sam-muted">
                            {supportAudienceLabel(c.audience, t)}
                          </span>
                          {unread > 0 ? (
                            <span className="rounded-full bg-sam-danger px-1.5 text-[12px] font-bold text-sam-on-primary tabular-nums">
                              {formatAdminNumber(unread)}
                            </span>
                          ) : null}
                          <span className="ml-auto text-[12px] text-sam-muted">
                            {waitingAgeLabel(c.last_message_at, t)}
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
                          <AdminToneBadge tone={adminSupportStatusTone(c.status)}>
                            {supportAdminStatusLabel(c.status, t)}
                          </AdminToneBadge>
                          {c.priority !== "NORMAL" ? (
                            <span className="rounded border border-sam-danger px-1 text-[12px] text-sam-danger">
                              {supportPriorityLabel(c.priority, t)}
                            </span>
                          ) : null}
                          {!c.assigned_admin_id && c.status !== "RESOLVED" && c.status !== "ARCHIVED" ? (
                            <span className="text-[12px] text-sam-muted">{t("admin_support_filter_unassigned")}</span>
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
              {t("admin_support_select_inquiry")}
            </p>
          ) : detailPane === "loading" ? (
            <AdminLoadingState ko={ko} />
          ) : detailPane === "error" || !activeCase ? (
            <div className="space-y-2 p-4" role="alert">
              <p className="text-sm text-sam-danger">{adminSupportErrorLabel(safeT, error)}</p>
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
                    disabled={busy}
                    onClick={() => setActiveId(null)}
                  >
                    ← {t("admin_support_list")}
                  </AdminActionButton>
                  <h2 className="text-base font-bold text-sam-fg">{activeCase.public_case_no}</h2>
                  <AdminToneBadge tone={adminSupportStatusTone(activeCase.status)}>
                    {supportAdminStatusLabel(activeCase.status, t)}
                  </AdminToneBadge>
                  {activeCase.priority !== "NORMAL" ? (
                    <span className="rounded border border-sam-danger px-1.5 text-[12px] text-sam-danger">
                      {supportPriorityLabel(activeCase.priority, t)}
                    </span>
                  ) : null}
                  <span className="text-xs text-sam-muted">
                    {safeT("admin_support_assignee_label")}:{" "}
                    {activeCase.assigned_admin_id
                      ? activeCase.assigned_admin_id === selfAdminId
                        ? safeT("admin_support_assignee_self")
                        : <AdminTechId id={activeCase.assigned_admin_id} />
                      : safeT("admin_support_unassigned")}
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
                          onClick={() => void patchCase({ action: "assign", assigneeAdminId: null }, activeCase.id)}
                        >
                          {safeT("admin_support_unassign")}
                        </AdminActionButton>
                      ) : (
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          disabled={busy || !selfAdminId}
                          data-admin-support-assign-self="1"
                          onClick={() => void patchCase({ action: "assign", assigneeAdminId: selfAdminId }, activeCase.id)}
                        >
                          {safeT("admin_support_assign_self")}
                        </AdminActionButton>
                      )}
                      <select
                        value={activeCase.priority}
                        disabled={busy}
                        data-admin-support-priority="1"
                        aria-label={safeT("admin_support_priority_label")}
                        className="h-8 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-xs"
                        onChange={(e) => void patchCase({ action: "priority", priority: e.target.value }, activeCase.id)}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {(`${t("admin_support_priority_label")} `) + supportPriorityLabel(p, t)}
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
                    {t("admin_support_details")}
                  </AdminChipButton>
                  <div className="ml-auto flex gap-2">
                    {activeOpen ? (
                      // 진행 중 상담의 주 동작은 아래 [답변] — 종료는 보조 (primary 1개).
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        className={ADMIN_SUPPORT_NARROW_PRIMARY_TAP_CLASS}
                        data-admin-support-resolve="1"
                        onClick={() =>
                          void confirmThenPatch(
                            // 점검 M6: 화면에 보이는 마지막 글 시각 — 그 뒤 고객 글이 왔으면 서버가 case_updated 로 막는다
                            buildAdminSupportResolvePayload(activeCase.last_message_at),
                            {
                              title: safeT("admin_support_resolve"),
                              description: t("admin_support_closes_customer_sees_it_as_closed", { public_case_no: String(activeCase.public_case_no) }),
                              confirmLabel: safeT("admin_support_resolve"),
                            }
                          )
                        }
                      >
                        {safeT("admin_support_resolve")}
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
                                title: t("admin_support_archive_case"),
                                description: t("admin_support_moves_to_archive_you_can_unarchive", { public_case_no: String(activeCase.public_case_no) }),
                                confirmLabel: t("admin_support_archive"),
                              }
                            )
                          }
                        >
                          {t("admin_support_archive")}
                        </AdminActionButton>
                        <AdminActionButton
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          data-admin-support-reopen="1"
                          className={ADMIN_SUPPORT_NARROW_PRIMARY_TAP_CLASS}
                          onClick={() =>
                            void confirmThenPatch(
                              { action: "reopen" },
                              {
                                title: safeT("admin_support_reopen"),
                                description: t("admin_support_reopens", { public_case_no: String(activeCase.public_case_no) }),
                                confirmLabel: safeT("admin_support_reopen"),
                              }
                            )
                          }
                        >
                          {safeT("admin_support_reopen")}
                        </AdminActionButton>
                      </>
                    ) : null}
                    {st === "ARCHIVED" ? (
                      <>
                      {/* U-11 (계약 §2): 보관 문의도 바로 재오픈 — 보관 해제 → 재오픈 2단계를 거치지 않는다 */}
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        data-admin-support-reopen="1"
                        className={ADMIN_SUPPORT_NARROW_PRIMARY_TAP_CLASS}
                        onClick={() =>
                          void confirmThenPatch(
                            { action: "reopen" },
                            {
                              title: safeT("admin_support_reopen"),
                              description: t("admin_support_reopens", { public_case_no: String(activeCase.public_case_no) }),
                              confirmLabel: safeT("admin_support_reopen"),
                            }
                          )
                        }
                      >
                        {safeT("admin_support_reopen")}
                      </AdminActionButton>
                      <AdminActionButton
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        data-admin-support-unarchive="1"
                        onClick={() =>
                          void confirmThenPatch(
                            { action: "unarchive" },
                            {
                              title: t("admin_support_unarchive"),
                              description: t("admin_support_moves_out_of_archive", { public_case_no: String(activeCase.public_case_no) }),
                              confirmLabel: t("admin_support_unarchive"),
                            }
                          )
                        }
                      >
                        {t("admin_support_unarchive")}
                      </AdminActionButton>
                      </>
                    ) : null}
                  </div>
                </div>
                {error ? (
                  <p className="text-xs text-sam-danger" role="alert">
                    {adminSupportErrorLabel(safeT, error)}
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
                          {m.edited_at && !m.deleted_at ? ` · ${t("admin_support_edited")}` : ""}
                        </p>
                        {followupIssues[m.id] && activeCase ? (
                          <p className="mb-1 text-[12px] font-medium text-sam-fg" data-admin-support-followup-issue={m.id}>
                            {t("admin_support_followup_issue", {
                              issue: supportIssueLabel(safeT, activeCase.category, followupIssues[m.id]) ?? followupIssues[m.id],
                            })}
                          </p>
                        ) : null}
                        {m.deleted_at ? (
                          <p className="text-xs italic text-sam-muted">
                            {t("admin_support_deleted_hidden_from_customer")}
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
                                  const ok = await patchCase(
                                    { action: "edit_message", messageId: m.id, body: editDraft },
                                    activeCase.id
                                  );
                                  if (ok) setEditingId(null);
                                }}
                              >
                                {adminCta("save", ko)}
                              </AdminActionButton>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{resolveSupportMessageDisplayBody(safeT, m.body)}</p>
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
                                  title: t("admin_support_delete_message"),
                                  description: t("admin_support_deletes_your_message_customer_sees_deleted"),
                                  confirmLabel: adminCta("delete", ko),
                                  destructive: true,
                                  retypeValue: t("admin_support_delete"),
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
                    {t("admin_support_public_reply")}
                  </AdminChipButton>
                  <AdminChipButton selected={composerMode === "internal"} onClick={() => setComposerMode("internal")}>
                    {safeT("admin_support_internal_note")}
                  </AdminChipButton>
                </div>
                {composerMode === "public" && activeClosed ? (
                  <p
                    className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-xs text-sam-muted"
                    data-admin-support-reply-closed="1"
                  >
                    {t("admin_support_this_case_is_closed_reopen_it")}
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
                          ? t("admin_support_reply_to_customer_ctrl_enter")
                          : t("admin_support_internal_note_hidden_from_customer")
                      }
                      className={`min-h-[4.5rem] flex-1 rounded-ui-rect border p-2 text-sm ${
                        composerMode === "internal" ? "border-sam-warning bg-sam-warning-soft" : "border-sam-border bg-sam-surface"
                      }`}
                    />
                    <AdminActionButton
                      variant="primary"
                      disabled={busy || !draft.trim()}
                      aria-busy={busy || undefined}
                      data-admin-support-send-busy={busy ? "1" : undefined}
                      data-admin-support-send="1"
                      className={`shrink-0 ${ADMIN_SUPPORT_NARROW_PRIMARY_TAP_CLASS}`}
                      onClick={() => void sendComposer()}
                    >
                      {busy
                        ? t("admin_support_sending")
                        : composerMode === "public"
                          ? safeT("admin_support_reply")
                          : safeT("admin_support_save_note")}
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
              <h3 className="text-xs font-semibold text-sam-muted">{t("admin_support_customer")}</h3>
              <p className="mt-1 font-medium">{whoName(activeCase)}</p>
              {activeCase.requester_email ? (
                <p className="text-xs text-sam-muted">{activeCase.requester_email}</p>
              ) : null}
              <p className="break-all text-[12px] text-sam-muted">{activeCase.requester_user_id}</p>
            </section>
            {activeCase.owner_store_id ? (
              <section className="mt-3">
                <h3 className="text-xs font-semibold text-sam-muted">{t("common_store")}</h3>
                <p className="mt-1 font-medium">{activeCase.owner_store_name || "—"}</p>
                <p className="break-all text-[12px] text-sam-muted">{activeCase.owner_store_id}</p>
              </section>
            ) : null}
            <section className="mt-3">
              <h3 className="text-xs font-semibold text-sam-muted">{t("admin_support_inquiry")}</h3>
              <p className="mt-1">
                {categoryLabel(activeCase)}
                {activeCase.issue_type ? ` · ${issueLabel(activeCase)}` : ""}
              </p>
              <p className="mt-1 text-xs text-sam-muted">
                {t("admin_support_created_2")}: {formatAdminManilaDateTime(activeCase.created_at)}
              </p>
              <p className="text-xs text-sam-muted">
                {t("admin_support_last")}: {formatAdminManilaDateTime(activeCase.last_message_at)}
              </p>
            </section>
            <section className="mt-3" data-admin-support-business-ref="1">
              <h3 className="text-xs font-semibold text-sam-muted">{t("admin_support_reference_2")}</h3>
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
              <h3 className="text-xs font-semibold text-sam-muted">{t("admin_support_shortcuts")}</h3>
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
                        {t(link.labelKey)}
                      </Link>
                    ) : (
                      <span className="text-xs text-sam-muted" data-admin-support-context-link-locked={link.mutationOwner}>
                        {t("admin_support_link_permission_required", { label: t(link.labelKey) })}
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

/** 병합 전 L2: 이 오류면 상세가 낡은 것 — 다시 읽는다 */
const ADMIN_SUPPORT_RELOAD_ON_ERROR = new Set([
  "case_updated",
  "case_closed",
  "status_conflict",
  "invalid_transition",
  "invalid_seen_last_message_at",
]);

export function AdminSupportPage({ initialCaseId }: { initialCaseId?: string }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminSupportPageInner initialCaseId={initialCaseId} />
    </Suspense>
  );
}
