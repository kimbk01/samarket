"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AdminTableBottomHorizontalScroll } from "@/components/admin/AdminTableBottomHorizontalScroll";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  ADMIN_USERS_LITE_BTN_PRIMARY,
  ADMIN_USERS_LITE_BTN_SECONDARY,
  ADMIN_USERS_LITE_BTN_TERTIARY,
  ADMIN_USERS_LITE_CARD,
  ADMIN_USERS_LITE_PAGE_BG,
} from "@/lib/ui/admin-users-lite-styles";
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
  const { t } = useI18n();
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
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [membersKey, setMembersKey] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
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
      return code;
    },
    [t],
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
    if (!adminUserId || !(await dibayConfirm({ title: t("admin_users_cleanup_confirm"), confirmTone: "destructive" }))) return;
    setCleanupLoading(true);
    try {
      const res = await fetch("/api/admin/users/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        refreshMembers();
      } else {
        await dibayAlert({ title: data.error || t("admin_users_cleanup_failed") });
      }
    } catch {
      await dibayAlert({ title: t("admin_users_request_failed") });
    } finally {
      setCleanupLoading(false);
    }
  }, [adminUserId, refreshMembers, t]);

  const queryScopeKey = [membersQueryParams, String(membersKey)].join("|");
  const emptyMessage = appliedSearch ? MEMBER_LIST_SEARCH_EMPTY_KO : MEMBER_LIST_EMPTY_KO;

  return (
    <AdminManagementSurfaceRoot
      proofSurface="users"
      wave="w2"
      className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6${showBottomFixedScroll ? " pb-[4.5rem]" : ""}`}
    >
      <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
        <span>{MEMBER_ADMIN_COPY.member_management}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#101828]">{MEMBER_ADMIN_COPY.member_management}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#667085]">
            {MEMBER_LIST_PAGE_DESCRIPTION_KO}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/users/deletion-requests"
            className={ADMIN_USERS_LITE_BTN_TERTIARY}
            data-member-list-deletion-entry="1"
            data-member-cta-variant="tertiary"
          >
            {MEMBER_LIST_DELETION_REQUESTS_KO}
            {deletionOpenCount != null && deletionOpenCount > 0 ? ` ${deletionOpenCount}` : ""}
          </Link>
          <Link
            href="/admin/users/ops-history"
            className={ADMIN_USERS_LITE_BTN_SECONDARY}
            data-member-list-ops-entry="1"
            data-member-cta-variant="secondary"
          >
            {MEMBER_LIST_OPS_HISTORY_KO}
          </Link>
          {canManageUsers ? (
            <button
              type="button"
              onClick={() => setShowCreateMember(true)}
              className={ADMIN_USERS_LITE_BTN_PRIMARY}
              data-member-list-register-cta="1"
              data-member-cta-variant="primary"
            >
              + {MEMBER_ADMIN_COPY.member_register}
            </button>
          ) : null}
          {isMaster ? (
            <button
              type="button"
              onClick={handleCleanup}
              disabled={cleanupLoading}
              className={`${ADMIN_USERS_LITE_BTN_TERTIARY} order-last opacity-80 disabled:opacity-50`}
              data-member-list-maintenance="1"
              data-member-cta-variant="tertiary"
              title="테스트 회원 정리 (R9 / OD-05)"
            >
              {cleanupLoading ? t("admin_users_saving") : t("admin_users_cleanup_button")}
            </button>
          ) : null}
        </div>
      </div>

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
        loading={membersListPending}
      />
      {membersError ? (
        <div
          className="rounded-lg border border-[#fad2cf] bg-white px-4 py-6 text-center text-sm text-[#b42318]"
          data-member-list-state="error"
        >
          <p className="font-bold">{MEMBER_LIST_ERROR_KO}</p>
          <p className="mt-1">{membersError}</p>
          <button
            type="button"
            onClick={refreshMembers}
            className="mt-4 rounded-full border border-[#fad2cf] bg-[#fff3f2] px-4 py-2 text-sm font-bold text-[#b42318] hover:bg-[#ffe7e5]"
          >
            다시 시도
          </button>
        </div>
      ) : membersListPending ? (
        <div
          className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}
          data-member-list-state="loading"
          aria-busy="true"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-[#eaecf0]" />
          <div className="h-10 animate-pulse rounded bg-[#f2f4f7]" />
          <div className="h-10 animate-pulse rounded bg-[#f2f4f7]" />
          <div className="h-10 animate-pulse rounded bg-[#f2f4f7]" />
          <p className="text-center text-sm font-semibold text-[#667085]">목록을 불러오는 중…</p>
        </div>
      ) : users.length === 0 ? (
        <div
          className={`${ADMIN_USERS_LITE_CARD} py-12 text-center text-sm font-semibold text-[#667085]`}
          data-member-list-state={appliedSearch ? "search_empty" : "empty"}
        >
          {emptyMessage}
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
