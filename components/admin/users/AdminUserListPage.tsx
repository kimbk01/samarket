"use client";

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTableBottomHorizontalScroll } from "@/components/admin/AdminTableBottomHorizontalScroll";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminMemberMessengerHref } from "@/lib/admin-users/admin-member-messenger-link";
import { fetchAdminStaffList } from "@/lib/admin-users/admin-staff-api";
import { fetchAdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { useAdminMe } from "@/hooks/useAdminMe";
import type { AdminStaff } from "@/lib/types/admin-staff";
import {
  ADMIN_USERS_CARD_CLASS,
} from "@/lib/ui/admin-users-starbucks-styles";
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
import { AdminStaffTable } from "./AdminStaffTable";
import { CreateAdminForm } from "./CreateAdminForm";
import { EditAdminForm } from "./EditAdminForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { EditMemberForm } from "./EditMemberForm";
import { AdminUserDetailModal } from "./AdminUserDetailModal";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAccountCategory, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";

type Tab = "general" | "store" | "admin";

type AdminUsersListResult = {
  users: AdminUser[];
  summary: {
    totalRows: number;
    accountCategoryCounts: Record<AdminAccountCategory, number>;
  };
};

const EMPTY_ACCOUNT_COUNTS: Record<AdminAccountCategory, number> = {
  member: 0,
  store_manager: 0,
  admin: 0,
};

export function AdminUserListPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailFromUrl = searchParams.get("detail");
  const [tab, setTab] = useState<Tab>("general");
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminAccountCategory | "">("member");
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
  const detailUserId = detailFromUrl?.trim() || null;
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

  const openDetail = useCallback(
    (userId: string) => {
      const id = userId.trim();
      if (!id) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("detail", id);
      router.replace(`/admin/users?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeDetail = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("detail");
    const next = params.toString();
    router.replace(next ? `/admin/users?${next}` : "/admin/users", { scroll: false });
  }, [router, searchParams]);

  const handleViewDetail = useCallback(
    (user: AdminUser) => {
      openDetail(user.id);
    },
    [openDetail],
  );

  const handleSendMessage = useCallback(
    (user: AdminUser) => {
      closeDetail();
      router.push(adminMemberMessengerHref(user.id));
    },
    [closeDetail, router],
  );

  const handleSendMessageToUserId = useCallback(
    (userId: string) => {
      closeDetail();
      router.push(adminMemberMessengerHref(userId));
    },
    [closeDetail, router],
  );

  const membersQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("search", appliedSearch);
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    return params.toString();
  }, [appliedSearch, roleFilter, statusFilter]);

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
    enabled: tab !== "admin",
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
            accountCategoryCounts?: Partial<Record<AdminAccountCategory, number>>;
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
        return {
          users,
          summary: {
            totalRows: data.summary?.totalRows ?? users.length,
            accountCategoryCounts: {
              member: counts.member ?? 0,
              store_manager: counts.store_manager ?? 0,
              admin: counts.admin ?? 0,
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
    loading: staffLoading,
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
  const paginatedUsers = useMemo(() => {
    const start = (membersPage - 1) * membersPageSize;
    return users.slice(start, start + membersPageSize);
  }, [membersPage, membersPageSize, users]);
  const membersListPending =
    membersLoading || (membersRefreshing && users.length === 0);
  const memberSummary = useMemo(() => {
    const counts = membersFromApi?.summary?.accountCategoryCounts ?? EMPTY_ACCOUNT_COUNTS;
    return {
      total: membersFromApi?.summary?.totalRows ?? users.length,
      member: counts.member,
      storeManager: counts.store_manager,
      admin: counts.admin,
    };
  }, [membersFromApi, users.length]);

  const isMaster = isSuperAdmin;
  const handleTabChange = useCallback((next: Tab) => {
    setTab(next);
    setRoleFilter(next === "general" ? "member" : next === "store" ? "store_manager" : "");
    setMembersPage(1);
  }, []);
  const tabTitleKey: MessageKey =
    tab === "general"
      ? "admin_users_tab_general"
      : tab === "store"
        ? "admin_users_tab_store"
        : "admin_users_tab_admin";

  const showMembersTable =
    tab !== "admin" && !membersError && !membersListPending && users.length > 0;
  const showStaffTable = tab === "admin" && staffList.length > 0;
  const showTableScrollChrome = showMembersTable || showStaffTable;

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
    if (!adminUserId || !confirm(t("admin_users_cleanup_confirm"))) return;
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
        alert(data.error || t("admin_users_cleanup_failed"));
      }
    } catch {
      alert(t("admin_users_request_failed"));
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
          <h1 className="text-2xl font-bold text-[#101828]">
            {t(tabTitleKey)}
          </h1>
          <div className="mt-3 flex rounded-lg border border-[#e4e7ec] bg-white p-1 shadow-sm">
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
          {tab === "general" && (
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

      {tab !== "admin" && (
        <>
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
            <div className="rounded-2xl border border-[#fad2cf] bg-white px-4 py-6 text-center text-sm text-[#b42318] shadow-sm">
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
              {t("admin_users_empty_filtered")}
            </div>
          ) : (
            <AdminUserTable
              ref={tableScrollRef}
              users={paginatedUsers}
              totalItems={users.length}
              page={membersPage}
              pageSize={membersPageSize}
              onPageChange={setMembersPage}
              onPageSizeChange={handleMembersPageSizeChange}
              onViewDetail={handleViewDetail}
              onEditMember={handleEditMember}
              onSendMessage={handleSendMessage}
              category={tab === "store" ? "store_manager" : "member"}
              onHorizontalScroll={onTableHorizontalScroll}
            />
          )}
        </>
      )}

      {tab === "admin" && (
        <>
          {staffError ? (
            <div className="rounded-2xl border border-[#fad2cf] bg-white px-4 py-6 text-center text-sm text-[#b42318] shadow-sm">
              <p className="font-bold">{t("admin_users_list_error_title")}</p>
              <p className="mt-1">{staffError}</p>
              <button
                type="button"
                onClick={refreshStaff}
                className="mt-4 rounded-full border border-[#fad2cf] bg-[#fff3f2] px-4 py-2 text-sm font-bold text-[#b42318] hover:bg-[#ffe7e5]"
              >
                {t("admin_users_retry")}
              </button>
            </div>
          ) : staffLoading && staffList.length === 0 ? (
            <div className={`${ADMIN_USERS_CARD_CLASS} py-12 text-center text-sm font-semibold text-[#6F4E37]`}>
              {t("admin_users_loading_list")}
            </div>
          ) : staffList.length === 0 ? (
            <div className={`${ADMIN_USERS_CARD_CLASS} py-12 text-center text-sm font-semibold text-[#6F4E37]`}>
              {t("admin_users_staff_empty")}
              {isMaster ? t("admin_users_staff_empty_master_hint") : null}
            </div>
          ) : (
            <AdminStaffTable
              ref={tableScrollRef}
              staffList={staffList}
              isMaster={isMaster}
              onEdit={setEditingStaffId}
              onHorizontalScroll={onTableHorizontalScroll}
            />
          )}
        </>
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
      {detailUserId ? (
        <AdminUserDetailModal
          key={detailUserId}
          userId={detailUserId}
          onClose={closeDetail}
          onUpdated={refreshMembers}
          onSendMessage={handleSendMessageToUserId}
        />
      ) : null}
    </div>
  );
}
