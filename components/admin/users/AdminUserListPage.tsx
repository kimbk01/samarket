"use client";

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AdminTableBottomHorizontalScroll } from "@/components/admin/AdminTableBottomHorizontalScroll";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import { ADMIN_USERS_LITE_CARD, ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { membersOperatorErrorCode } from "@/lib/admin/status-labels/members-status-labels";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { adminFetch, invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import { invalidateAdminQueryCache } from "@/lib/admin/admin-query-cache";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { AdminUserFilterBar } from "./AdminUserFilterBar";
import { AdminUserListSummaryCards } from "./AdminUserListSummaryCards";
import { AdminUserTable } from "./AdminUserTable";
import { CreateMemberForm } from "./CreateMemberForm";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAccountCategory, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";
import type {
  AdminMemberOriginFilter,
  AdminMemberPrivilegeFilter,
  AdminMemberStoreFilter,
  AdminMemberVerifyFilter,
} from "@/lib/admin-users/admin-member-list-query";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_LIST_DELETION_REQUESTS_KO,
  MEMBER_LIST_EMPTY_KO,
  MEMBER_LIST_ERROR_KO,
  MEMBER_LIST_OPS_HISTORY_KO,
  MEMBER_LIST_PAGE_DESCRIPTION_KO,
  MEMBER_LIST_SEARCH_EMPTY_KO,
  buildMemberListQueryString,
  memberListDetailHref,
  parseMemberListQueryState,
  type MemberListSortId,
  type MemberListSummaryChipId,
} from "@/lib/admin-users/member-list-presentation";
import { fetchAdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";

type AdminUsersListResult = {
  users: AdminUser[];
  summary: {
    totalRows: number;
    totalProfiles: number | null;
    countsOk: boolean;
    accountCategoryCounts: Record<AdminAccountCategory, number | null>;
    statusCategoryCounts: Partial<Record<AdminUserStatusCategory, number | null>>;
  };
};

export function AdminUserListPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = useMemo(
    () => parseMemberListQueryState(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams],
  );

  const [searchDraft, setSearchDraft] = useState(urlState.search);
  const [appliedSearch, setAppliedSearch] = useState(urlState.search);
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusCategory | "">(urlState.status);
  const [verifyFilter, setVerifyFilter] = useState<AdminMemberVerifyFilter | "">(urlState.verify);
  const [storeFilter, setStoreFilter] = useState<AdminMemberStoreFilter | "">(urlState.store);
  const [privilegeFilter, setPrivilegeFilter] = useState<AdminMemberPrivilegeFilter | "">(urlState.privilege);
  const [originFilter, setOriginFilter] = useState<AdminMemberOriginFilter | "">(urlState.origin);
  const [joinedFrom, setJoinedFrom] = useState(urlState.joinedFrom);
  const [joinedTo, setJoinedTo] = useState(urlState.joinedTo);
  const [sort, setSort] = useState<MemberListSortId>(urlState.sort);
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [membersKey, setMembersKey] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);
  const [membersPage, setMembersPage] = useState(urlState.page);
  const [membersPageSize, setMembersPageSize] = useState(urlState.pageSize);
  const [deletionOpenCount, setDeletionOpenCount] = useState<number | null>(null);
  const { isSuperAdmin, hasPermission } = useAdminMe();
  const canManageUsers = isSuperAdmin || hasPermission("users");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [tableClientWidth, setTableClientWidth] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const syncingFromUrl = useRef(false);

  const [adminUserId, setAdminUserId] = useState<string>(() => getCurrentUser()?.id ?? "");
  useEffect(() => {
    const onAuthChanged = () => {
      const id = getCurrentUser()?.id ?? "";
      setAdminUserId((prev) => (prev === id ? prev : id));
    };
    onAuthChanged();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  useEffect(() => {
    syncingFromUrl.current = true;
    setSearchDraft(urlState.search);
    setAppliedSearch(urlState.search);
    setStatusFilter(urlState.status);
    setVerifyFilter(urlState.verify);
    setStoreFilter(urlState.store);
    setPrivilegeFilter(urlState.privilege);
    setOriginFilter(urlState.origin);
    setJoinedFrom(urlState.joinedFrom);
    setJoinedTo(urlState.joinedTo);
    setSort(urlState.sort);
    setMembersPage(urlState.page);
    setMembersPageSize(urlState.pageSize);
    syncingFromUrl.current = false;
  }, [
    urlState.search,
    urlState.status,
    urlState.verify,
    urlState.store,
    urlState.privilege,
    urlState.origin,
    urlState.joinedFrom,
    urlState.joinedTo,
    urlState.sort,
    urlState.page,
    urlState.pageSize,
  ]);

  const pushListQuery = useCallback(
    (next: {
      search: string;
      status: AdminUserStatusCategory | "";
      verify: AdminMemberVerifyFilter | "";
      store: AdminMemberStoreFilter | "";
      privilege: AdminMemberPrivilegeFilter | "";
      origin: AdminMemberOriginFilter | "";
      joinedFrom: string;
      joinedTo: string;
      sort: MemberListSortId;
      page: number;
      pageSize: number;
    }) => {
      const qs = buildMemberListQueryString(next);
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  useEffect(() => {
    if (syncingFromUrl.current) return;
    pushListQuery({
      search: appliedSearch,
      status: statusFilter,
      verify: verifyFilter,
      store: storeFilter,
      privilege: privilegeFilter,
      origin: originFilter,
      joinedFrom,
      joinedTo,
      sort,
      page: membersPage,
      pageSize: membersPageSize,
    });
  }, [
    appliedSearch,
    statusFilter,
    verifyFilter,
    storeFilter,
    privilegeFilter,
    originFilter,
    joinedFrom,
    joinedTo,
    sort,
    membersPage,
    membersPageSize,
    pushListQuery,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/account-deletion-requests?status=open&limit=30", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { items?: unknown[] };
        if (!cancelled && res.ok) {
          setDeletionOpenCount(Array.isArray(data.items) ? data.items.length : 0);
        }
      } catch {
        if (!cancelled) setDeletionOpenCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [membersKey]);

  const handleViewDetail = useCallback(
    (user: AdminUser) => {
      const id = user.id.trim();
      if (!id) return;
      router.push(memberListDetailHref(id));
    },
    [router],
  );

  const membersQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("search", appliedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (verifyFilter) params.set("verify", verifyFilter);
    if (storeFilter) params.set("store", storeFilter);
    if (privilegeFilter) params.set("privilege", privilegeFilter);
    if (originFilter) params.set("origin", originFilter);
    if (joinedFrom) params.set("joinedFrom", joinedFrom);
    if (joinedTo) params.set("joinedTo", joinedTo);
    if (sort && sort !== "created_at_desc") params.set("sort", sort);
    params.set("page", String(membersPage));
    params.set("pageSize", String(membersPageSize));
    return params.toString();
  }, [
    appliedSearch,
    statusFilter,
    verifyFilter,
    storeFilter,
    privilegeFilter,
    originFilter,
    joinedFrom,
    joinedTo,
    sort,
    membersPage,
    membersPageSize,
  ]);

  const applySearch = useCallback(() => {
    setAppliedSearch(searchDraft.trim());
    setMembersPage(1);
  }, [searchDraft]);

  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setAppliedSearch("");
    setMembersPage(1);
  }, []);

  /** 필터 초기화 — 검색어·5개 축·가입 기간·정렬을 기본값으로 (URL 동기화는 기존 effect 가 처리). */
  const resetFilters = useCallback(() => {
    setSearchDraft("");
    setAppliedSearch("");
    setStatusFilter("");
    setVerifyFilter("");
    setStoreFilter("");
    setPrivilegeFilter("");
    setOriginFilter("");
    setJoinedFrom("");
    setJoinedTo("");
    setSort("created_at_desc");
    setMembersPage(1);
  }, []);

  const membersQueryKey = `admin:users:list:${membersKey}:${membersQueryParams}`;

  const {
    data: membersFromApi,
    error: membersErrorCode,
    loading: membersLoading,
    refreshing: membersRefreshing,
  } = useAdminQuery<AdminUsersListResult>({
    queryKey: membersQueryKey,
    enabled: true,
    ttlMs: ADMIN_QUERY_TTL_MS,
    revalidateOnMount: true,
    fetcher: async () => {
      try {
        const url = membersQueryParams ? `/api/admin/users?${membersQueryParams}` : "/api/admin/users";
        const res = await adminFetch(url, {
          credentials: "include",
          cache: "no-store",
          dedupeKey: membersQueryKey,
          cacheTtlMs: ADMIN_QUERY_TTL_MS,
        });
        const data = (await res.json().catch(() => ({}))) as {
          users?: AdminUser[];
          summary?: {
            totalRows?: number;
            totalProfiles?: number | null;
            countsOk?: boolean;
            accountCategoryCounts?: Partial<Record<AdminAccountCategory, number | null>>;
            statusCategoryCounts?: Partial<Record<AdminUserStatusCategory, number | null>>;
          };
          error?: string;
          code?: string;
        };
        if (res.status === 401) throw new Error("admin_users_error_login_required");
        if (res.status === 403) throw new Error("admin_users_error_admin_only");
        if (!res.ok) {
          if (data.code === "supabase_service_unconfigured") {
            throw new Error("admin_users_error_service_role_missing");
          }
          throw new Error("admin_users_error_fetch_failed");
        }
        const users = data.users ?? [];
        const counts = data.summary?.accountCategoryCounts ?? {};
        const statusCounts = data.summary?.statusCategoryCounts ?? {};
        const countsOk = data.summary?.countsOk !== false;
        return {
          users,
          summary: {
            totalRows: data.summary?.totalRows ?? users.length,
            totalProfiles: countsOk ? (data.summary?.totalProfiles ?? null) : null,
            countsOk,
            accountCategoryCounts: {
              member: countsOk ? (counts.member ?? null) : null,
              store_manager: countsOk ? (counts.store_manager ?? null) : null,
              admin: countsOk ? (counts.admin ?? null) : null,
            },
            statusCategoryCounts: {
              active: countsOk ? (statusCounts.active ?? null) : null,
              needs_review: countsOk ? (statusCounts.needs_review ?? null) : null,
              suspended: countsOk ? (statusCounts.suspended ?? null) : null,
              blocked: countsOk ? (statusCounts.blocked ?? null) : null,
              deleted: countsOk ? (statusCounts.deleted ?? null) : null,
            },
          },
        };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("admin_")) throw err;
        throw new Error("admin_users_error_network");
      }
    },
  });

  const resolveAdminUsersQueryError = useCallback(
    (code: string | null) => {
      if (!code) return null;
      if (code.startsWith("admin_") || code.startsWith("common_")) {
        return t(code as MessageKey);
      }
      return adminOperatorErrorMessage(membersOperatorErrorCode(code, "load_failed"), ko);
    },
    [t, ko],
  );

  const membersError = useMemo(
    () => resolveAdminUsersQueryError(membersErrorCode),
    [membersErrorCode, resolveAdminUsersQueryError],
  );

  useEffect(() => {
    const total = membersFromApi?.summary?.totalRows;
    if (total == null) return;
    const maxPage = Math.max(1, Math.ceil(total / membersPageSize));
    if (membersPage > maxPage) setMembersPage(maxPage);
  }, [membersFromApi?.summary?.totalRows, membersPage, membersPageSize]);

  useEffect(() => {
    void fetchAdminMeSnapshot();
  }, []);

  const users = useMemo(() => membersFromApi?.users ?? [], [membersFromApi]);
  const membersListPending = membersLoading || (membersRefreshing && users.length === 0);
  const filteredTotal = membersFromApi?.summary?.totalRows ?? 0;
  const memberSummary = useMemo(() => {
    const counts = membersFromApi?.summary?.accountCategoryCounts;
    const statusCounts = membersFromApi?.summary?.statusCategoryCounts;
    const countsOk = membersFromApi?.summary?.countsOk !== false;
    return {
      total: countsOk ? (membersFromApi?.summary?.totalProfiles ?? null) : null,
      active: countsOk ? (statusCounts?.active ?? null) : null,
      suspended: countsOk ? (statusCounts?.suspended ?? null) : null,
      blocked: countsOk ? (statusCounts?.blocked ?? null) : null,
      storeOps: countsOk ? (counts?.store_manager ?? null) : null,
      admin: countsOk ? (counts?.admin ?? null) : null,
    };
  }, [membersFromApi]);

  const handleSummaryChip = useCallback((chip: MemberListSummaryChipId) => {
    if (chip === "all") {
      setStatusFilter("");
      setStoreFilter("");
      setPrivilegeFilter("");
      setMembersPage(1);
      return;
    }
    if (chip === "store_ops") {
      setStoreFilter("has_store");
      setMembersPage(1);
      return;
    }
    if (chip === "admin") {
      setPrivilegeFilter("admin");
      setMembersPage(1);
      return;
    }
    setStatusFilter(chip);
    setMembersPage(1);
  }, []);

  const isMaster = isSuperAdmin;
  const showMembersTable = !membersError && !membersListPending && users.length > 0;
  const showTableScrollChrome = showMembersTable;

  const onTableHorizontalScroll = useCallback(() => {
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (!tableEl || !bottomEl) return;
    if (bottomEl.scrollLeft !== tableEl.scrollLeft) bottomEl.scrollLeft = tableEl.scrollLeft;
  }, []);

  const onBottomHorizontalScroll = useCallback(() => {
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (!tableEl || !bottomEl) return;
    if (tableEl.scrollLeft !== bottomEl.scrollLeft) tableEl.scrollLeft = bottomEl.scrollLeft;
  }, []);

  useEffect(() => {
    const syncSidebar = () => setSidebarExpanded(readSidebarExpanded());
    syncSidebar();
    window.addEventListener("storage", syncSidebar);
    window.addEventListener("focus", syncSidebar);
    return () => {
      window.removeEventListener("storage", syncSidebar);
      window.removeEventListener("focus", syncSidebar);
    };
  }, []);

  const measureTableScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el || !showTableScrollChrome) {
      setTableScrollWidth(0);
      setTableClientWidth(0);
      return;
    }
    setTableScrollWidth(el.scrollWidth);
    setTableClientWidth(el.clientWidth);
  }, [showTableScrollChrome]);

  useLayoutEffect(() => {
    if (!showTableScrollChrome) {
      setTableScrollWidth(0);
      setTableClientWidth(0);
      return;
    }
    measureTableScroll();
    const el = tableScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureTableScroll());
    ro.observe(el);
    window.addEventListener("resize", measureTableScroll);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureTableScroll);
    };
  }, [measureTableScroll, showTableScrollChrome, users.length, membersLoading, membersError]);

  const showBottomFixedScroll = showTableScrollChrome && tableScrollWidth > tableClientWidth + 2;

  useLayoutEffect(() => {
    if (!showBottomFixedScroll) return;
    measureTableScroll();
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (tableEl && bottomEl) bottomEl.scrollLeft = tableEl.scrollLeft;
  }, [showBottomFixedScroll, measureTableScroll, tableScrollWidth]);

  const refreshMembers = useCallback(() => {
    invalidateAdminFetchCache("admin:users");
    invalidateAdminQueryCache("admin:users:list:");
    setMembersKey((k) => k + 1);
  }, []);

  const handleCleanup = useCallback(async () => {
    if (!adminUserId) return;
    const retype = ko ? "테스트 회원 정리" : "cleanup test members";
    const confirmed = await confirmAdminAction({
      level: "L3",
      ko,
      title: t("admin_users_cleanup_button"),
      description: t("admin_users_cleanup_confirm"),
      confirmLabel: adminCta("delete", ko),
      destructive: true,
      retypeValue: retype,
    });
    if (!confirmed.ok) return;
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/admin/users/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setCleanupResult({ ok: true, message: ko ? "테스트 회원을 정리했습니다." : "Test members cleaned up." });
        refreshMembers();
      } else {
        setCleanupResult({ ok: false, code: membersOperatorErrorCode(data.error) });
      }
    } catch {
      setCleanupResult({ ok: false, code: "network_error" });
    } finally {
      setCleanupLoading(false);
    }
  }, [adminUserId, refreshMembers, t, ko]);

  const hasActiveFilters = Boolean(
    appliedSearch ||
      statusFilter ||
      verifyFilter ||
      storeFilter ||
      privilegeFilter ||
      originFilter ||
      joinedFrom ||
      joinedTo ||
      sort !== "created_at_desc",
  );

  const queryScopeKey = [membersQueryParams, String(membersKey)].join("|");
  const emptyMessage = appliedSearch ? MEMBER_LIST_SEARCH_EMPTY_KO : MEMBER_LIST_EMPTY_KO;

  return (
    <AdminManagementSurfaceRoot
      proofSurface="users"
      wave="w2"
      className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6${showBottomFixedScroll ? " pb-[4.5rem]" : ""}`}
    >
      <nav className="text-xs font-medium text-sam-muted" aria-label="Breadcrumb">
        <span>{MEMBER_ADMIN_COPY.member_management}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-sam-fg">{t("admin_menu_users")}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sam-muted">
            {MEMBER_LIST_PAGE_DESCRIPTION_KO}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminActionLink
            href="/admin/users/phone-verification"
            variant="quiet"
            data-member-list-phone-otp-ops="1"
            data-member-cta-variant="tertiary"
          >
            {ko ? "전화번호 인증 관리" : "Phone verification"}
          </AdminActionLink>
          <AdminActionLink
            href="/admin/users/deletion-requests"
            variant="quiet"
            data-member-list-deletion-entry="1"
            data-member-cta-variant="tertiary"
          >
            {MEMBER_LIST_DELETION_REQUESTS_KO}
            {deletionOpenCount != null && deletionOpenCount > 0 ? ` ${formatAdminNumber(deletionOpenCount)}` : ""}
          </AdminActionLink>
          <AdminActionLink
            href="/admin/users/ops-history"
            variant="secondary"
            data-member-list-ops-entry="1"
            data-member-cta-variant="secondary"
          >
            {MEMBER_LIST_OPS_HISTORY_KO}
          </AdminActionLink>
          {canManageUsers ? (
            <AdminActionButton
              variant="primary"
              onClick={() => setShowCreateMember(true)}
              data-member-list-register-cta="1"
              data-member-cta-variant="primary"
            >
              {MEMBER_ADMIN_COPY.member_register}
            </AdminActionButton>
          ) : null}
          {isMaster ? (
            <AdminActionButton
              variant="quiet"
              onClick={handleCleanup}
              disabled={cleanupLoading}
              className="order-last"
              data-member-list-maintenance="1"
              data-member-cta-variant="tertiary"
              title={ko ? "테스트 회원 정리 (R9 / OD-05)" : "Clean up test members (R9 / OD-05)"}
            >
              {t("admin_users_cleanup_button")}
            </AdminActionButton>
          ) : null}
        </div>
      </div>

      <AdminResultBanner ko={ko} result={cleanupResult} onClose={() => setCleanupResult(null)} />

      <AdminUserListSummaryCards
        summary={memberSummary}
        activeStatus={statusFilter}
        activeStore={storeFilter}
        activePrivilege={privilegeFilter}
        onSelect={handleSummaryChip}
      />
      <AdminUserFilterBar
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onSearchSubmit={applySearch}
        onSearchClear={clearSearch}
        onReset={hasActiveFilters ? resetFilters : undefined}
        statusFilter={statusFilter}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          setMembersPage(1);
        }}
        verifyFilter={verifyFilter}
        onVerifyFilterChange={(value) => {
          setVerifyFilter(value);
          setMembersPage(1);
        }}
        storeFilter={storeFilter}
        onStoreFilterChange={(value) => {
          setStoreFilter(value);
          setMembersPage(1);
        }}
        privilegeFilter={privilegeFilter}
        onPrivilegeFilterChange={(value) => {
          setPrivilegeFilter(value);
          setMembersPage(1);
        }}
        originFilter={originFilter}
        onOriginFilterChange={(value) => {
          setOriginFilter(value);
          setMembersPage(1);
        }}
        joinedFrom={joinedFrom}
        onJoinedFromChange={(value) => {
          setJoinedFrom(value);
          setMembersPage(1);
        }}
        joinedTo={joinedTo}
        onJoinedToChange={(value) => {
          setJoinedTo(value);
          setMembersPage(1);
        }}
        sort={sort}
        onSortChange={(value) => {
          setSort(value);
          setMembersPage(1);
        }}
        loading={membersListPending}
      />
      {membersError ? (
        <div
          className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-6 text-center text-sm text-sam-fg"
          data-member-list-state="error"
          data-admin-state="error"
          role="alert"
        >
          <p className="font-bold text-sam-danger">{MEMBER_LIST_ERROR_KO}</p>
          <p className="mt-1">{membersError}</p>
          <AdminActionButton variant="secondary" size="sm" className="mt-3" onClick={refreshMembers}>
            {adminCta("refresh", ko)}
          </AdminActionButton>
        </div>
      ) : membersListPending ? (
        <div
          className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}
          data-member-list-state="loading"
          aria-busy="true"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-sam-border-soft" />
          <div className="h-10 animate-pulse rounded bg-sam-surface-muted" />
          <div className="h-10 animate-pulse rounded bg-sam-surface-muted" />
          <div className="h-10 animate-pulse rounded bg-sam-surface-muted" />
          <p className="text-center text-sm font-semibold text-sam-muted">
            {ko ? "목록을 불러오는 중…" : "Loading list…"}
          </p>
        </div>
      ) : users.length === 0 ? (
        <div data-member-list-state={appliedSearch ? "search_empty" : "empty"}>
          <AdminEmptyState
            ko={ko}
            message={emptyMessage}
            onReset={hasActiveFilters ? resetFilters : undefined}
          />
        </div>
      ) : (
        <AdminUserTable
          ref={tableScrollRef}
          users={users}
          queryScopeKey={queryScopeKey}
          totalItems={filteredTotal}
          page={membersPage}
          pageSize={membersPageSize}
          onPageChange={setMembersPage}
          onPageSizeChange={(size) => {
            setMembersPageSize(size);
            setMembersPage(1);
          }}
          onViewDetail={handleViewDetail}
          onSelectionActionCompleted={refreshMembers}
          onHorizontalScroll={onTableHorizontalScroll}
        />
      )}

      <AdminTableBottomHorizontalScroll
        show={showBottomFixedScroll}
        tableScrollWidth={tableScrollWidth}
        bottomScrollRef={bottomScrollRef}
        onScroll={onBottomHorizontalScroll}
        ariaLabel={t("admin_users_table_horizontal_scroll")}
        insetForAdminSidebar={sidebarExpanded}
      />

      {showCreateMember ? (
        <CreateMemberForm onClose={() => setShowCreateMember(false)} onSuccess={refreshMembers} />
      ) : null}
    </AdminManagementSurfaceRoot>
  );
}
