"use client";

import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
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
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminUserFilterBar } from "./AdminUserFilterBar";
import { AdminUserTable } from "./AdminUserTable";
import { AdminStaffTable } from "./AdminStaffTable";
import { CreateAdminForm } from "./CreateAdminForm";
import { EditAdminForm } from "./EditAdminForm";
import { CreateMemberForm } from "./CreateMemberForm";
import { EditMemberForm } from "./EditMemberForm";
import type { AdminUser } from "@/lib/types/admin-user";
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

export function AdminUserListPage() {
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

  const currentUser = getCurrentUser();
  const adminUserId = currentUser?.id ?? "";

  const fetchMembers = useCallback(async () => {
    if (!adminUserId) {
      setMembersFromApi(null);
      setMembersError("관리자 세션을 확인하는 중입니다.");
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await runSingleFlight(`admin-users:list:${adminUserId}:${membersKey}`, () =>
        fetch("/api/admin/users", { credentials: "include" })
      );
      const data = (await res.clone().json().catch(() => ({}))) as {
        users?: AdminUser[];
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setMembersFromApi([]);
        setMembersError(
          data.error ||
            (data.code === "supabase_service_unconfigured"
              ? "SUPABASE_SERVICE_ROLE_KEY가 없어 회원 목록을 불러올 수 없습니다."
              : "회원 목록을 불러오지 못했습니다.")
        );
        return;
      }
      const list = data.users ?? [];
      setMembersFromApi(list);
    } catch {
      setMembersFromApi([]);
      setMembersError("회원 목록 요청에 실패했습니다. 네트워크 또는 서버 로그를 확인해 주세요.");
    } finally {
      setMembersLoading(false);
    }
  }, [adminUserId, membersKey]);

  useEffect(() => {
    if (tab === "members" && adminUserId) {
      fetchMembers();
    }
  }, [tab, adminUserId, membersKey, fetchMembers]);

  const users = useMemo(() => membersFromApi ?? [], [membersFromApi]);
  const filtered = useMemo(
    () => filterAndSortUsers(users, filters, searchQuery),
    [users, filters, searchQuery]
  );

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
    if (!adminUserId || !confirm("관리자(role=admin) 계정만 남기고 나머지 테스트 회원을 삭제합니다. 계속할까요?")) return;
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
        alert(data.error || "정리 실패");
      }
    } catch {
      alert("요청 실패");
    } finally {
      setCleanupLoading(false);
    }
  }, [adminUserId, refreshMembers]);

  return (
    <div className="space-y-4 bg-[#f0f2f5] text-[#050505]">
      <AdminPageHeader title="회원 관리" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-full border border-[#dadde1] bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "members" ? "bg-[#1877f2] text-white shadow-sm" : "text-[#65676b] hover:bg-[#f0f2f5] hover:text-[#050505]"}`}
          >
            회원
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "staff" ? "bg-[#1877f2] text-white shadow-sm" : "text-[#65676b] hover:bg-[#f0f2f5] hover:text-[#050505]"}`}
          >
            관리자
          </button>
        </div>
        <div className="flex items-center gap-2">
          {tab === "members" && (
            <>
              <button
                type="button"
                onClick={() => setShowCreateMember(true)}
                className="rounded-full bg-[#1877f2] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#166fe5]"
              >
                수동 입력
              </button>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className="rounded-full border border-[#fad2cf] bg-[#fff3f2] px-4 py-2 text-sm font-bold text-[#b42318] transition hover:bg-[#ffe7e5] disabled:opacity-50"
                >
                  {cleanupLoading ? "처리 중…" : "테스트 회원 정리 (aaaa만 유지)"}
                </button>
              )}
            </>
          )}
          {tab === "staff" && isMaster && (
            <button
              type="button"
              onClick={() => setShowCreateAdmin(true)}
              className="rounded-full bg-[#1877f2] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#166fe5]"
            >
              관리자 수동 생성
            </button>
          )}
        </div>
      </div>

      {tab === "members" && (
        <>
          <div className="rounded-2xl border border-[#dadde1] bg-white px-4 py-3 text-sm leading-relaxed text-[#65676b] shadow-sm">
            <p className="font-bold text-[#050505]">회원 목록</p>
            <p className="mt-1">
              로그인 아이디 또는{" "}
              <code className="rounded bg-[#f0f2f5] px-1.5 py-0.5 text-[#050505]">아이디@{MANUAL_MEMBER_EMAIL_DOMAIN}</code> + 비밀번호 →{" "}
              <Link href="/login" className="font-bold text-[#1877f2] underline">
                /login
              </Link>
              . 로컬에서 배포와 같은 회원 DB인지{" "}
              <a href="/api/system/supabase-project" className="font-bold text-[#1877f2] underline">
                /api/system/supabase-project
              </a>{" "}
              로 <code className="rounded bg-[#f0f2f5] px-1.5 py-0.5 text-[#050505]">projectRef</code> 비교.
            </p>
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
              <p className="font-bold">회원 목록을 표시할 수 없습니다.</p>
              <p className="mt-1">{membersError}</p>
              <button
                type="button"
                onClick={refreshMembers}
                className="mt-4 rounded-full border border-[#fad2cf] bg-[#fff3f2] px-4 py-2 text-sm font-bold text-[#b42318] hover:bg-[#ffe7e5]"
              >
                다시 불러오기
              </button>
            </div>
          ) : membersLoading ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              회원 목록을 불러오는 중입니다.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-[#dadde1] bg-white py-12 text-center text-sm font-semibold text-[#65676b] shadow-sm">
              조건에 맞는 회원이 없습니다. 수동 입력으로 회원을 추가해 보세요.
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
              등록된 관리자가 없습니다.
              {isMaster && " 상단의 ‘관리자 수동 생성’으로 추가하세요."}
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
