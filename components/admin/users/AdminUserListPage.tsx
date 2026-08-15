"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AdminTableBottomHorizontalScroll } from "@/components/admin/AdminTableBottomHorizontalScroll";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { memberNoteComposeHref } from "@/lib/admin-users/member-deep-links";
import { fetchAdminStaffList } from "@/lib/admin-users/admin-staff-api";
import { fetchAdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { useAdminMe } from "@/hooks/useAdminMe";
import type { AdminStaff } from "@/lib/types/admin-staff";
import {
  ADMIN_USERS_LITE_BTN_OUTLINE_DANGER,
  ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY,
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
import { CreateAdminForm } from "./CreateAdminForm";
import { EditAdminForm } from "./EditAdminForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { EditMemberForm } from "./EditMemberForm";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAccountCategory, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";

type Tab = "all" | "general" | "store" | "admin";

type AdminUsersListResult = {
  users: AdminUser[];
  summary: {
    totalRows: number;
    totalProfiles: number | null;
    countsOk: boolean;
    accountCategoryCounts: Record<AdminAccountCategory, number | null>;
  };
};

export function AdminUserListPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminAccountCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusCategory | "">("");
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<AdminUser | null>(null);
  const [staffKey, setStaffKey] = useState(0);
  const [membersKey, setMembersKey] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(10);
  const { isSuperAdmin } = useAdminMe();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [tableClientWidth, setTableClientWidth] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // 클라이언트 캐시(`getCurrentUser()`)는 첫 렌더에서 비어 있고, `SupabaseAuthSync` 가 한 프레임 뒤에 채운다.
  // 동기 1회 읽기 + `TEST_AUTH_CHANGED_EVENT` 구독으로 하이드레이션 후 다시 그리게 한다.
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

  const handleViewDetail = useCallback(
    (user: AdminUser) => {
      const id = user.id.trim();
      if (!id) return;
      router.push(`/admin/users/${encodeURIComponent(id)}`);
    },
    [router],
  );

  const handleSendMessage = useCallback(
    (user: AdminUser) => {
      router.push(memberNoteComposeHref(user.id));
    },
    [router],
  );

  const membersQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("search", appliedSearch);
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(membersPage));
    params.set("pageSize", String(membersPageSize));
    return params.toString();
  }, [appliedSearch, roleFilter, statusFilter, membersPage, membersPageSize]);

  const applySearch = useCallback(() => {
    setAppliedSearch(searchDraft.trim());
    setMembersPage(1);
  }, [searchDraft]);
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
    [t]
  );

  const {
    data: staffFromQuery,
    error: staffErrorCode,
  } = useAdminQuery<AdminStaff[]>({
    queryKey: `admin:staff:list:${staffKey}`,
    enabled: tab === "admin",
    ttlMs: ADMIN_QUERY_TTL_MS,
    fetcher: async () => {
      try {
        return await fetchAdminStaffList();
      } catch {
        throw new Error("admin_users_error_network");
      }
    },
  });

  const staffList = staffFromQuery ?? [];

  const membersError = useMemo(
    () => resolveAdminUsersQueryError(membersErrorCode),
    [membersErrorCode, resolveAdminUsersQueryError]
  );

  const staffError = useMemo(
    () => resolveAdminUsersQueryError(staffErrorCode),
    [staffErrorCode, resolveAdminUsersQueryError]
  );

  useEffect(() => {
    setMembersPage(1);
  }, [appliedSearch, roleFilter, statusFilter, membersKey]);

  useEffect(() => {
    const total = membersFromApi?.summary?.totalRows;
    if (total == null) return;
    const maxPage = Math.max(1, Math.ceil(total / membersPageSize));
    if (membersPage > maxPage) setMembersPage(maxPage);
  }, [membersFromApi?.summary?.totalRows, membersPage, membersPageSize]);

  const handleRoleFilterChange = useCallback((value: AdminAccountCategory | "") => {
    setRoleFilter(value);
    setMembersPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((value: AdminUserStatusCategory | "") => {
    setStatusFilter(value);
    setMembersPage(1);
  }, []);

  const handleMembersPageSizeChange = useCallback((size: number) => {
    setMembersPageSize(size);
    setMembersPage(1);
  }, []);

  useEffect(() => {
    void fetchAdminMeSnapshot();
  }, []);

  const users = useMemo(() => membersFromApi?.users ?? [], [membersFromApi]);
  const membersListPending =
    membersLoading || (membersRefreshing && users.length === 0);
  const filteredTotal = membersFromApi?.summary?.totalRows ?? 0;
  const memberSummary = useMemo(() => {
    const counts = membersFromApi?.summary?.accountCategoryCounts;
    const countsOk = membersFromApi?.summary?.countsOk !== false;
    return {
      total: countsOk ? (membersFromApi?.summary?.totalProfiles ?? null) : null,
      member: countsOk ? (counts?.member ?? null) : null,
      storeManager: countsOk ? (counts?.store_manager ?? null) : null,
      admin: countsOk ? (counts?.admin ?? null) : null,
    };
  }, [membersFromApi]);

  const isMaster = isSuperAdmin;
  const handleTabChange = useCallback((next: Tab) => {
    setTab(next);
    setRoleFilter(
      next === "general" ? "member" : next === "store" ? "store_manager" : next === "admin" ? "admin" : "",
    );
    setMembersPage(1);
  }, []);
  const tabTitleKey: MessageKey =
    tab === "all"
      ? "admin_users_tab_all"
      : tab === "general"
        ? "admin_users_tab_general"
        : tab === "store"
          ? "admin_users_tab_store"
          : "admin_users_tab_admin";

  const staffByUserId = useMemo(() => {
    const map = new Map<string, AdminStaff>();
    for (const row of staffList) map.set(row.id, row);
    return map;
  }, [staffList]);

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
  }, [
    measureTableScroll,
    showTableScrollChrome,
    tab,
    users.length,
    staffList.length,
    membersLoading,
    membersError,
  ]);

  const showBottomFixedScroll = showTableScrollChrome && tableScrollWidth > tableClientWidth + 2;

  useLayoutEffect(() => {
    if (!showBottomFixedScroll) return;
    measureTableScroll();
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (tableEl && bottomEl) bottomEl.scrollLeft = tableEl.scrollLeft;
  }, [showBottomFixedScroll, measureTableScroll, tableScrollWidth]);

  const refreshStaff = useCallback(() => {
    invalidateAdminQueryCache("admin:staff:list:");
    setStaffKey((k) => k + 1);
  }, []);
  const refreshMembers = useCallback(() => {
    invalidateAdminFetchCache("admin:users");
    invalidateAdminQueryCache("admin:users:list:");
    setMembersKey((k) => k + 1);
  }, []);

  const handleEditMember = useCallback((u: AdminUser) => {
    setEditingMember(u);
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

  return (
    <div className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6${showBottomFixedScroll ? " pb-[4.5rem]" : ""}`}>
      <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
        <span>{t("admin_users_lite_breadcrumb_members")}</span>
        <span className="mx-1.5 text-[#98a2b3]">›</span>
        <span className="text-[#344054]">{t(tabTitleKey)}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#101828]">
            {t("admin_users_lite_breadcrumb_members")}
          </h1>
          <div className="mt-3 flex rounded-lg border border-[#e4e7ec] bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              className={
                tab === "all"
                  ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                  : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#f9fafb]"
              }
            >
              {t("admin_users_tab_all")}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("general")}
              className={
                tab === "general"
                  ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                  : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#f9fafb]"
              }
            >
              {t("admin_users_tab_general")}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("store")}
              className={
                tab === "store"
                  ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                  : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#f9fafb]"
              }
            >
              {t("admin_users_tab_store")}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("admin")}
              className={
                tab === "admin"
                  ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                  : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#f9fafb]"
              }
            >
              {t("admin_users_tab_admin")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(tab === "all" || tab === "general") && (
            <>
              <button
                type="button"
                onClick={() => setShowCreateMember(true)}
                className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
              >
                + {t("admin_users_manual_create")}
              </button>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className={`${ADMIN_USERS_LITE_BTN_OUTLINE_DANGER} disabled:opacity-50`}
                >
                  {cleanupLoading ? t("admin_users_saving") : t("admin_users_cleanup_button")}
                </button>
              )}
            </>
          )}
          {tab === "admin" && isMaster && (
            <button
              type="button"
              onClick={() => setShowCreateAdmin(true)}
              className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
            >
              + {t("admin_users_create_admin")}
            </button>
          )}
        </div>
      </div>

      {tab === "admin" && staffError ? (
        <p className="text-[12px] text-[#b42318]">{staffError}</p>
      ) : null}
      <AdminUserListSummaryCards summary={memberSummary} />
      <AdminUserFilterBar
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onSearchSubmit={applySearch}
        roleFilter={roleFilter}
        onRoleFilterChange={handleRoleFilterChange}
        hideRoleFilter
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
      />
      {membersError ? (
        <div className="rounded-lg border border-[#fad2cf] bg-white px-4 py-6 text-center text-sm text-[#b42318]">
          <p className="font-bold">{t("admin_users_list_error_title")}</p>
          <p className="mt-1">{membersError}</p>
          <button
            type="button"
            onClick={refreshMembers}
            className="mt-4 rounded-full border border-[#fad2cf] bg-[#fff3f2] px-4 py-2 text-sm font-bold text-[#b42318] hover:bg-[#ffe7e5]"
          >
            {t("admin_users_retry")}
          </button>
        </div>
      ) : membersListPending ? (
        <div className={`${ADMIN_USERS_LITE_CARD} py-12 text-center text-sm font-semibold text-[#667085]`}>
          {t("admin_users_loading_list")}
        </div>
      ) : users.length === 0 ? (
        <div className={`${ADMIN_USERS_LITE_CARD} py-12 text-center text-sm font-semibold text-[#667085]`}>
          {tab === "admin" ? t("admin_users_staff_empty") : t("admin_users_empty_filtered")}
        </div>
      ) : (
        <AdminUserTable
          ref={tableScrollRef}
          users={users}
          totalItems={filteredTotal}
          page={membersPage}
          pageSize={membersPageSize}
          onPageChange={setMembersPage}
          onPageSizeChange={handleMembersPageSizeChange}
          onViewDetail={handleViewDetail}
          onEditMember={handleEditMember}
          onSendMessage={handleSendMessage}
          onEditPermissions={isMaster ? setEditingStaffId : undefined}
          variant={tab === "store" ? "store" : tab === "admin" ? "admin" : "all"}
          staffByUserId={staffByUserId}
          isMaster={isMaster}
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

      {showCreateMember && adminUserId && (
        <CreateMemberForm
          onClose={() => setShowCreateMember(false)}
          onSuccess={refreshMembers}
        />
      )}
      {showCreateAdmin && (
        <CreateAdminForm
          onClose={() => setShowCreateAdmin(false)}
          onSuccess={refreshStaff}
        />
      )}
      {editingStaffId && (
        <EditAdminForm
          staffId={editingStaffId}
          onClose={() => setEditingStaffId(null)}
          onSuccess={refreshStaff}
        />
      )}
      {editingMember && (
        <EditMemberForm
          user={editingMember}
          onClose={() => setEditingMember(null)}
          onSuccess={refreshMembers}
        />
      )}
    </div>
  );
}
