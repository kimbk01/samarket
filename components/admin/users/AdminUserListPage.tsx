"use client";

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AdminTableBottomHorizontalScroll } from "@/components/admin/AdminTableBottomHorizontalScroll";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_USER_PROVIDER_LABEL_KEY,
  filterAndSortUsers,
  normalizeAdminUserSortKey,
  normalizeAdminUserSortOrder,
  type AdminUserFilters,
  type AdminUserSortKey,
  type AdminUserSortOrder,
} from "@/lib/admin-users/admin-user-utils";
import { fetchAdminStaffList } from "@/lib/admin-users/admin-staff-api";
import { fetchAdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { useAdminMe } from "@/hooks/useAdminMe";
import type { AdminStaff } from "@/lib/types/admin-staff";
import {
  ADMIN_USERS_PAGE_BG_CLASS,
  ADMIN_USERS_CARD_CLASS,
  ADMIN_USERS_PRIMARY_BTN_CLASS,
  ADMIN_USERS_DANGER_BTN_CLASS,
  ADMIN_USERS_TAB_ACTIVE_CLASS,
  ADMIN_USERS_TAB_IDLE_CLASS,
} from "@/lib/ui/admin-users-starbucks-styles";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { adminFetch, invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import { invalidateAdminQueryCache } from "@/lib/admin/admin-query-cache";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminUserFilterBar } from "./AdminUserFilterBar";
import { AdminUserTable } from "./AdminUserTable";
import { AdminStaffTable } from "./AdminStaffTable";
import { CreateAdminForm } from "./CreateAdminForm";
import { EditAdminForm } from "./EditAdminForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { EditMemberForm } from "./EditMemberForm";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAuthProvider, AdminUser } from "@/lib/types/admin-user";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import { MANUAL_MEMBER_EMAIL_DOMAIN } from "@/lib/auth/manual-member-email";

const DEFAULT_FILTERS: AdminUserFilters = {
  authProvider: "",
  phoneVerified: "",
  moderationStatus: "",
  memberType: "",
  location: "",
  sortKey: "joined" as AdminUserSortKey,
  sortOrder: "desc",
};

type Tab = "members" | "staff";

const PROVIDER_SUMMARY_ORDER: AdminAuthProvider[] = [
  "google",
  "kakao",
  "naver",
  "apple",
  "facebook",
  "email",
  "manual",
  "unknown",
];

const PROVIDER_SUMMARY_META: Record<AdminAuthProvider, { shortLabel: string; className: string }> = {
  google: {
    shortLabel: "G",
    className: "border-sam-primary-border bg-white text-sam-primary",
  },
  kakao: {
    shortLabel: "K",
    className: "border-[#f4d35e] bg-[#fff8d8] text-[#7a5a00]",
  },
  naver: {
    shortLabel: "N",
    className: "border-[#bdecc8] bg-[#ecf8ef] text-[#128a3a]",
  },
  apple: {
    shortLabel: "A",
    className: "border-[#dadde1] bg-white text-[#050505]",
  },
  facebook: {
    shortLabel: "f",
    className: "border-sam-primary-border bg-sam-primary-soft text-sam-primary",
  },
  email: {
    shortLabel: "@",
    className: "border-sam-primary-border bg-sam-primary-soft text-sam-primary",
  },
  manual: {
    shortLabel: "M",
    className: "border-[#cfd6df] bg-[#f8fafc] text-[#475467]",
  },
  unknown: {
    shortLabel: "?",
    className: "border-[#dadde1] bg-[#f7f8fa] text-[#65676b]",
  },
};

function normalizeSummaryProvider(provider: AdminUser["authProvider"]): AdminAuthProvider {
  return provider && PROVIDER_SUMMARY_ORDER.includes(provider) ? provider : "unknown";
}

export function AdminUserListPage() {
  const { t, language } = useI18n();
  const countLocale = language === "en" ? "en-US" : "ko-KR";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSortKey = normalizeAdminUserSortKey(searchParams.get("sort"));
  const initialSortOrder = normalizeAdminUserSortOrder(searchParams.get("order"));
  const [tab, setTab] = useState<Tab>("members");
  const [filters, setFilters] = useState<AdminUserFilters>({
    ...DEFAULT_FILTERS,
    sortKey: initialSortKey,
    sortOrder: initialSortOrder,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<AdminUser | null>(null);
  const [staffKey, setStaffKey] = useState(0);
  const [membersKey, setMembersKey] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const { isSuperAdmin } = useAdminMe();
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
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

  const membersQueryKey = `admin:users:list:${membersKey}`;

  const {
    data: membersFromApi,
    error: membersErrorCode,
    loading: membersLoading,
  } = useAdminQuery<AdminUser[]>({
    queryKey: membersQueryKey,
    enabled: tab === "members",
    ttlMs: ADMIN_QUERY_TTL_MS,
    fetcher: async () => {
      try {
        const res = await adminFetch("/api/admin/users", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: membersQueryKey,
          cacheTtlMs: ADMIN_QUERY_TTL_MS,
        });
        const data = (await res.json().catch(() => ({}))) as {
          users?: AdminUser[];
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
        return data.users ?? [];
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
    enabled: tab === "staff",
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
    void fetchAdminMeSnapshot();
  }, []);

  const users = useMemo(() => membersFromApi ?? [], [membersFromApi]);
  const filtered = useMemo(
    () => filterAndSortUsers(users, filters, searchQuery),
    [users, filters, searchQuery]
  );
  const memberSummary = useMemo(() => {
    const counts = PROVIDER_SUMMARY_ORDER.reduce(
      (acc, provider) => ({ ...acc, [provider]: 0 }),
      {} as Record<AdminAuthProvider, number>
    );
    for (const user of users) {
      counts[normalizeSummaryProvider(user.authProvider)] += 1;
    }
    return {
      total: users.length,
      visible: filtered.length,
      counts,
    };
  }, [filtered.length, users]);

  const isMaster = isSuperAdmin;

  const showMembersTable =
    tab === "members" && !membersError && !membersLoading && filtered.length > 0;
  const showStaffTable = tab === "staff" && staffList.length > 0;
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
    filtered.length,
    staffList.length,
    showMemberUuid,
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

  const replaceSortQuery = useCallback(
    (sortKey: AdminUserSortKey, sortOrder: AdminUserSortOrder) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("sort", sortKey);
      next.set("order", sortOrder);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleSortChange = useCallback(
    (key: AdminUserSortKey) => {
      setFilters((prev) => {
        const nextOrder: AdminUserSortOrder =
          prev.sortKey === key ? (prev.sortOrder === "asc" ? "desc" : "asc") : "asc";
        const next = { ...prev, sortKey: key, sortOrder: nextOrder };
        replaceSortQuery(next.sortKey, next.sortOrder);
        return next;
      });
    },
    [replaceSortQuery]
  );

  const handleSortOrderChange = useCallback(
    (order: AdminUserSortOrder) => {
      setFilters((prev) => {
        const next = { ...prev, sortOrder: order };
        replaceSortQuery(next.sortKey, next.sortOrder);
        return next;
      });
    },
    [replaceSortQuery]
  );

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
    <div className={`${ADMIN_USERS_PAGE_BG_CLASS}${showBottomFixedScroll ? " pb-[4.5rem]" : ""}`}>
      <AdminPageHeader titleKey="admin_page_user_management" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-full border border-[#00704A]/15 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("members")}
            className={tab === "members" ? ADMIN_USERS_TAB_ACTIVE_CLASS : ADMIN_USERS_TAB_IDLE_CLASS}
          >
            {t("admin_users_tab_members")}
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={tab === "staff" ? ADMIN_USERS_TAB_ACTIVE_CLASS : ADMIN_USERS_TAB_IDLE_CLASS}
          >
            {t("admin_users_tab_staff")}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {tab === "members" && (
            <>
              <button
                type="button"
                onClick={() => setShowCreateMember(true)}
                className={ADMIN_USERS_PRIMARY_BTN_CLASS}
              >
                {t("admin_users_manual_create")}
              </button>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className={`${ADMIN_USERS_DANGER_BTN_CLASS} disabled:opacity-50`}
                >
                  {cleanupLoading ? t("admin_users_saving") : t("admin_users_cleanup_button")}
                </button>
              )}
            </>
          )}
          {tab === "staff" && isMaster && (
            <button
              type="button"
              onClick={() => setShowCreateAdmin(true)}
              className="rounded-full bg-sam-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sam-primary-hover active:bg-sam-primary-active"
            >
              {t("admin_users_create_admin")}
            </button>
          )}
        </div>
      </div>

      {tab === "members" && (
        <>
          <div className={`${ADMIN_USERS_CARD_CLASS} px-4 py-3 text-sm leading-relaxed text-[#6F4E37]`}>
            <p className="font-bold text-[#1E3932]">{t("admin_users_member_list_title")}</p>
            <p className="mt-1">{t("admin_users_member_list_ssot_hint", { domain: MANUAL_MEMBER_EMAIL_DOMAIN })}</p>
          </div>
          <div className={`${ADMIN_USERS_CARD_CLASS} p-4 font-sans`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e9edf3] pb-3">
              <div>
                <p className="text-xs font-bold tracking-[0.04em] text-[#667085]">{t("admin_users_member_summary_title")}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-[#101828]">
                  {t("admin_users_member_summary_total", {
                    count: memberSummary.total.toLocaleString(countLocale),
                  })}
                </p>
              </div>
              <div className="rounded-lg border border-sam-primary-border bg-sam-primary-soft px-3 py-2 text-right">
                <p className="text-xs font-bold text-sam-primary">{t("admin_users_member_summary_visible_label")}</p>
                <p className="text-lg font-black tabular-nums text-[#101828]">
                  {t("admin_users_member_summary_visible_count", {
                    count: memberSummary.visible.toLocaleString(countLocale),
                  })}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              {PROVIDER_SUMMARY_ORDER.map((provider) => {
                const meta = PROVIDER_SUMMARY_META[provider];
                return (
                  <div
                    key={provider}
                    className={`rounded-lg border px-3 py-2 ${meta.className}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black shadow-sm">
                        {meta.shortLabel}
                      </span>
                      <span className="text-lg font-black tabular-nums">
                        {memberSummary.counts[provider].toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-bold">{t(ADMIN_USER_PROVIDER_LABEL_KEY[provider])}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <AdminUserFilterBar
            filters={filters}
            searchQuery={searchQuery}
            onFiltersChange={setFilters}
            onSearchChange={setSearchQuery}
            showMemberUuid={showMemberUuid}
            onShowMemberUuidChange={setShowMemberUuid}
            onSortChange={handleSortChange}
            onSortOrderChange={handleSortOrderChange}
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
          ) : membersLoading && users.length === 0 ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              {t("admin_users_loading_list")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              {t("admin_users_empty_filtered")}
            </div>
          ) : (
            <AdminUserTable
              ref={tableScrollRef}
              users={filtered}
              showMemberUuid={showMemberUuid}
              sortKey={filters.sortKey}
              sortOrder={filters.sortOrder}
              onSortChange={handleSortChange}
              onEditMember={handleEditMember}
              onHorizontalScroll={onTableHorizontalScroll}
            />
          )}
        </>
      )}

      {tab === "staff" && (
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
    </div>
  );
}
