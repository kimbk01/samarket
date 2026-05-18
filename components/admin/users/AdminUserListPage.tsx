"use client";

import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
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
import { getAdminStaffList } from "@/lib/admin-users/mock-admin-staff";
import { getAdminRole } from "@/lib/admin-permission";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminUserFilterBar } from "./AdminUserFilterBar";
import { AdminUserTable } from "./AdminUserTable";
import { AdminStaffTable } from "./AdminStaffTable";
import { CreateAdminForm } from "./CreateAdminForm";
import { EditAdminForm } from "./EditAdminForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { EditMemberForm } from "./EditMemberForm";
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
  const [membersFromApi, setMembersFromApi] = useState<AdminUser[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();

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

  /**
   * 회원 목록 조회 — 권한 검증은 서버(`requireAdminApiUser`)가 한다.
   * 클라이언트의 `adminUserId` 가 비어 있어도(쿠키만 있고 프로필 캐시 미하이드레이션 상태) 호출을 막지 않는다.
   * 401·403 응답은 분명히 표면화하고, 200 이면 목록을 노출한다.
   */
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const flightKey = `admin-users:list:${adminUserId || "anon"}:${membersKey}`;
      const res = await runSingleFlight(flightKey, () =>
        fetch("/api/admin/users", { credentials: "include", cache: "no-store" })
      );
      const data = (await res.clone().json().catch(() => ({}))) as {
        users?: AdminUser[];
        error?: string;
        code?: string;
      };
      if (res.status === 401) {
        setMembersFromApi([]);
        setMembersError(t("admin_users_error_login_required"));
        return;
      }
      if (res.status === 403) {
        setMembersFromApi([]);
        setMembersError(data.error || t("admin_users_error_admin_only"));
        return;
      }
      if (!res.ok) {
        setMembersFromApi([]);
        setMembersError(
          data.error ||
            (data.code === "supabase_service_unconfigured"
              ? t("admin_users_error_service_role_missing")
              : t("admin_users_error_fetch_failed"))
        );
        return;
      }
      const list = data.users ?? [];
      setMembersFromApi(list);
    } catch {
      setMembersFromApi([]);
      setMembersError(t("admin_users_error_network"));
    } finally {
      setMembersLoading(false);
    }
  }, [adminUserId, membersKey, t]);

  useEffect(() => {
    if (tab !== "members") return;
    void fetchMembers();
  }, [tab, membersKey, fetchMembers]);

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

  const staffList = useMemo(() => getAdminStaffList(), [staffKey]);
  const isMaster = getAdminRole() === "master";

  const refreshStaff = useCallback(() => setStaffKey((k) => k + 1), []);
  const refreshMembers = useCallback(() => setMembersKey((k) => k + 1), []);

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
    <div className="space-y-4 bg-[#f0f2f5] text-[#050505]">
      <AdminPageHeader titleKey="admin_page_user_management" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-full border border-[#dadde1] bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "members" ? "bg-sam-primary text-white shadow-sm" : "text-[#65676b] hover:bg-[#f0f2f5] hover:text-[#050505]"}`}
          >
            {t("admin_users_tab_members")}
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "staff" ? "bg-sam-primary text-white shadow-sm" : "text-[#65676b] hover:bg-[#f0f2f5] hover:text-[#050505]"}`}
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
                className="rounded-full bg-sam-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sam-primary-hover active:bg-sam-primary-active"
              >
                {t("admin_users_manual_create")}
              </button>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className="rounded-full border border-[#fad2cf] bg-[#fff3f2] px-4 py-2 text-sm font-bold text-[#b42318] transition hover:bg-[#ffe7e5] disabled:opacity-50"
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
          <div className="rounded-2xl border border-[#dadde1] bg-white px-4 py-3 text-sm leading-relaxed text-[#65676b] shadow-sm">
            <p className="font-bold text-[#050505]">{t("admin_users_member_list_title")}</p>
            <p className="mt-1">
              {t("admin_users_member_list_help_a")}
              <code className="rounded bg-[#f0f2f5] px-1.5 py-0.5 text-[#050505]">
                {t("admin_users_manual_email_pattern", { domain: MANUAL_MEMBER_EMAIL_DOMAIN })}
              </code>
              {t("admin_users_member_list_help_b")}
              <Link href="/login" className="font-bold text-sam-primary underline hover:text-sam-primary-hover">
                /login
              </Link>
              {t("admin_users_member_list_help_c")}
              <a
                href="/api/system/supabase-project"
                className="font-bold text-sam-primary underline hover:text-sam-primary-hover"
              >
                /api/system/supabase-project
              </a>
              {t("admin_users_member_list_help_d")}
              <code className="rounded bg-[#f0f2f5] px-1.5 py-0.5 text-[#050505]">projectRef</code>
              {t("admin_users_member_list_help_e")}
            </p>
          </div>
          <div className="rounded-xl border border-[#d0d7e2] bg-white p-4 font-sans shadow-sm">
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
          ) : membersLoading ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              {t("admin_users_loading_list")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              {t("admin_users_empty_filtered")}
            </div>
          ) : (
            <AdminUserTable
              users={filtered}
              showMemberUuid={showMemberUuid}
              sortKey={filters.sortKey}
              sortOrder={filters.sortOrder}
              onSortChange={handleSortChange}
              onEditMember={handleEditMember}
            />
          )}
        </>
      )}

      {tab === "staff" && (
        <>
          {staffList.length === 0 ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              {t("admin_users_staff_empty")}
              {isMaster ? t("admin_users_staff_empty_master_hint") : null}
            </div>
          ) : (
            <AdminStaffTable
              staffList={staffList}
              isMaster={isMaster}
              onEdit={setEditingStaffId}
            />
          )}
        </>
      )}

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
