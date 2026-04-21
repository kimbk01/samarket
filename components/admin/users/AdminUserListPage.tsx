"use client";

import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  filterAndSortUsers,
  type AdminUserFilters,
  type AdminUserSortKey,
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
  moderationStatus: "",
  memberType: "",
  location: "",
  sortKey: "joined" as AdminUserSortKey,
};

type Tab = "members" | "staff";

export function AdminUserListPage() {
  const [tab, setTab] = useState<Tab>("members");
  const [filters, setFilters] = useState<AdminUserFilters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<AdminUser | null>(null);
  const [staffKey, setStaffKey] = useState(0);
  const [membersKey, setMembersKey] = useState(0);
  const [membersFromApi, setMembersFromApi] = useState<AdminUser[] | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();

  const currentUser = getCurrentUser();
  const adminUserId = currentUser?.id ?? "";

  const fetchMembers = useCallback(async () => {
    if (!adminUserId) {
      setMembersFromApi(null);
      return;
    }
    try {
      await runSingleFlight(`admin-users:list:${adminUserId}:${membersKey}`, async () => {
        const res = await fetch("/api/admin/users", { credentials: "include" });
        if (!res.ok) {
          setMembersFromApi(null);
          return;
        }
        const data = await res.json();
        const list = data.users ?? [];
        setMembersFromApi(list);
      });
    } catch {
      setMembersFromApi(null);
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
    <div className="space-y-4">
      <AdminPageHeader title="회원 관리" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-ui-rect border border-sam-border bg-sam-surface p-0.5">
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`rounded-ui-rect px-4 py-2 sam-text-body font-medium transition ${tab === "members" ? "bg-signature text-white" : "text-sam-muted hover:bg-sam-surface-muted"}`}
          >
            회원
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-ui-rect px-4 py-2 sam-text-body font-medium transition ${tab === "staff" ? "bg-signature text-white" : "text-sam-muted hover:bg-sam-surface-muted"}`}
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
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90"
              >
                수동 입력
              </button>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className="rounded-ui-rect border border-amber-600 bg-amber-50 px-4 py-2 sam-text-body font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
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
              className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90"
            >
              관리자 수동 생성
            </button>
          )}
        </div>
      </div>

      {tab === "members" && (
        <>
          <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-4 py-3 sam-text-helper leading-relaxed text-sam-fg">
            <p className="font-medium text-amber-950">회원 목록</p>
            <p className="mt-1">
              로그인 아이디 또는{" "}
              <code className="rounded bg-sam-surface/80 px-1">아이디@{MANUAL_MEMBER_EMAIL_DOMAIN}</code> + 비밀번호 →{" "}
              <Link href="/login" className="font-medium text-signature underline">
                /login
              </Link>
              . 로컬에서 배포와 같은 회원 DB인지{" "}
              <a href="/api/system/supabase-project" className="font-medium text-signature underline">
                /api/system/supabase-project
              </a>{" "}
              로 <code className="rounded bg-sam-surface/80 px-1">projectRef</code> 비교.
            </p>
          </div>
          <AdminUserFilterBar
            filters={filters}
            searchQuery={searchQuery}
            onFiltersChange={setFilters}
            onSearchChange={setSearchQuery}
            showMemberUuid={showMemberUuid}
            onShowMemberUuidChange={setShowMemberUuid}
          />
          {filtered.length === 0 ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
              조건에 맞는 회원이 없습니다. 수동 입력으로 회원을 추가해 보세요.
            </div>
          ) : (
            <AdminUserTable users={filtered} showMemberUuid={showMemberUuid} onEditMember={handleEditMember} />
          )}
        </>
      )}

      {tab === "staff" && (
        <>
          {staffList.length === 0 ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
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
