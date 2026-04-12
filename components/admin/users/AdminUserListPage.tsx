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
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) {
        setMembersFromApi(null);
        return;
      }
      const data = await res.json();
      const list = data.users ?? [];
      setMembersFromApi(list);
    } catch {
      setMembersFromApi(null);
    }
  }, [adminUserId]);

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
            className={`rounded-ui-rect px-4 py-2 text-[14px] font-medium transition ${tab === "members" ? "bg-signature text-white" : "text-sam-muted hover:bg-sam-surface-muted"}`}
          >
            회원
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-ui-rect px-4 py-2 text-[14px] font-medium transition ${tab === "staff" ? "bg-signature text-white" : "text-sam-muted hover:bg-sam-surface-muted"}`}
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
                className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90"
              >
                수동 입력
              </button>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className="rounded-ui-rect border border-amber-600 bg-amber-50 px-4 py-2 text-[14px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
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
              className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90"
            >
              관리자 수동 생성
            </button>
          )}
        </div>
      </div>

      {tab === "members" && (
        <>
          <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-4 py-3 text-[13px] leading-relaxed text-sam-fg">
            <p className="font-medium text-amber-950">회원 목록 (실회원 + 개발 로그인 연결)</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] text-sam-fg">
              <li>
                목록의 <strong>로그인 아이디</strong>(또는 <code className="rounded bg-sam-surface/80 px-1">아이디@manual.local</code>)와 비밀번호로{" "}
                <Link href="/login" className="font-medium text-signature underline">
                  로그인
                </Link>
                하면 <strong>회원 UUID</strong>와 동일한 사용자로 API·매장·주문이 연결됩니다. 내 정보에 있는 보조 로그인 폼을 써도 됩니다.
              </li>
              <li>
                <strong>수정</strong>: 각 행「작업」열에서 구분·전화 인증을 바꿀 수 있습니다(profiles DB). 관리자
                승격·강등은 최고 관리자만 가능합니다.
              </li>
              <li>일반 회원가입 계정도 이 목록에 함께 보이며, 전화번호 인증 승인 상태를 관리자에서 확인할 수 있습니다.</li>
              <li>
                로그인 세션은 브라우저 <strong>쿠키</strong>를 씁니다. <strong>같은 브라우저·같은 프로필</strong>
                에서 탭만 여러 개 열면 마지막 로그인이 덮어써서 한 사람처럼 보일 수 있습니다.
              </li>
              <li>
                <strong>서로 다른 브라우저</strong>(Chrome, Edge 등), <strong>Chrome 프로필을 나누기</strong>, 또는{" "}
                <strong>일반 창 + 시크릿(인코그니토)</strong>을 쓰면 동시에 서로 다른 계정으로 테스트할 수
                있습니다.
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminUserFilterBar
              filters={filters}
              searchQuery={searchQuery}
              onFiltersChange={setFilters}
              onSearchChange={setSearchQuery}
              showMemberUuid={showMemberUuid}
            />
            <label className="flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg shadow-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-sam-border text-signature focus:ring-signature"
                checked={showMemberUuid}
                onChange={(e) => setShowMemberUuid(e.target.checked)}
              />
              회원 UUID 표시
            </label>
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
              조건에 맞는 회원이 없습니다. 수동 입력으로 회원을 추가해 보세요.
            </div>
          ) : (
            <AdminUserTable
              users={filtered}
              showMemberUuid={showMemberUuid}
              onEditMember={(u) => setEditingMember(u)}
            />
          )}
        </>
      )}

      {tab === "staff" && (
        <>
          {staffList.length === 0 ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
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
