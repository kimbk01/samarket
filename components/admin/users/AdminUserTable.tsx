"use client";

import { forwardRef, memo, useCallback } from "react";
import Link from "next/link";
import { adminMemberNicknameSecondary } from "@/lib/admin-users/admin-member-identity";
import {
  MEMBER_LIST_DETAIL_ACTION_KO,
  MEMBER_LIST_STORE_NONE_KO,
  memberListAccountStateLabelKo,
  memberListPrivilegeLabelKo,
  memberListSignupOriginLabelKo,
  memberListStoreCellLabel,
} from "@/lib/admin-users/member-list-presentation";
import { authEvidenceBadges } from "@/lib/admin-users/admin-member-identity";
import { ADMIN_USERS_LITE_TABLE_ACTION } from "@/lib/ui/admin-users-lite-styles";
import { AdminUserListPagination } from "./AdminUserListPagination";
import {
  displayNameForAdminUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  publicIdForAdminUser,
  statusBadgeClass,
  statusCategoryForAdminUser,
} from "./admin-user-lite-display";
import type { AdminUser } from "@/lib/types/admin-user";
import {
  AdminManagementBulkBar,
  AdminManagementSelectionCheckbox,
  AdminManagementTableViewport,
  useAdminManagementSelection,
} from "@/components/admin/management";
import {
  computeTableMinWidthPx,
  managementColumnStyle,
  MEMBER_ENTITY_ACTION_POLICY,
  type ManagementColumnKind,
} from "@/lib/admin/management";

interface AdminUserTableProps {
  users: AdminUser[];
  queryScopeKey: string;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onViewDetail: (user: AdminUser) => void;
  onHorizontalScroll?: React.UIEventHandler<HTMLDivElement>;
}

const EVIDENCE_LABELS = {
  email: "이메일",
  phone: "전화",
  kakao: "카카오",
  google: "Google",
  apple: "Apple",
} as const;

function stopRowNav(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const AdminUserTableRow = memo(function AdminUserTableRow({
  user,
  onViewDetail,
  selected,
  onToggleSelected,
}: {
  user: AdminUser;
  onViewDetail: (user: AdminUser) => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const emptyCell = "—";
  const publicId = publicIdForAdminUser(user);
  const display = displayNameForAdminUser(user);
  const nick = adminMemberNicknameSecondary(display, user.nickname);
  const status = statusCategoryForAdminUser(user);
  const statusLabel = memberListAccountStateLabelKo(user);
  const handleViewDetail = useCallback(() => onViewDetail(user), [onViewDetail, user]);
  const initial = display.trim().slice(0, 1).toUpperCase() || "?";
  const storeCell = memberListStoreCellLabel(user);
  const privilege = memberListPrivilegeLabelKo(user);
  const origin = memberListSignupOriginLabelKo(user.authProvider);
  const evidence = authEvidenceBadges(user);
  const copyId = publicId || user.id;

  return (
    <tr
      className="cursor-pointer border-b border-[#eaecf0] bg-white text-[13px] hover:bg-[#f8fafc]"
      onClick={handleViewDetail}
      data-member-list-row="1"
      data-member-status={status}
    >
      <td className="px-3 py-2" style={managementColumnStyle("SELECTION")} onClick={stopRowNav}>
        <AdminManagementSelectionCheckbox
          role="row"
          checked={selected}
          onToggle={onToggleSelected}
          aria-label={`${display} 선택`}
        />
      </td>
      <td className="min-w-[180px] px-3 py-2" style={managementColumnStyle("TITLE")}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-xs font-bold text-[#2563eb]">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#101828]">{display}</p>
            {nick ? <p className="truncate text-[11px] text-[#667085]">{nick}</p> : null}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-[#344054]" onClick={stopRowNav}>
        <button
          type="button"
          className="rounded px-1 text-left hover:bg-[#f2f4f7]"
          title="회원 ID 복사"
          onClick={() => {
            const value = copyId.startsWith("@") ? copyId.slice(1) : copyId;
            void navigator.clipboard?.writeText(value).catch(() => {});
          }}
        >
          {publicId || emptyCell}
        </button>
      </td>
      <td className="px-3 py-2 text-[#475467]">
        <p>{user.phone?.trim() || emptyCell}</p>
        <p className="text-[11px] text-[#667085]">{user.email?.trim() || emptyCell}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex flex-wrap gap-1">
          {evidence.map((badge) => (
            <span
              key={badge}
              className="inline-flex rounded border border-[#e4e7ec] bg-[#f9fafb] px-1.5 py-0.5 text-[10px] font-semibold text-[#344054]"
            >
              {EVIDENCE_LABELS[badge]}
            </span>
          ))}
          {evidence.length === 0 ? emptyCell : null}
        </span>
      </td>
      <td className="min-w-[140px] px-3 py-2" onClick={stopRowNav}>
        {storeCell.kind === "none" ? (
          <span className="text-[#98a2b3]">{MEMBER_LIST_STORE_NONE_KO}</span>
        ) : (
          <Link href={storeCell.href!} className="block hover:underline" onClick={stopRowNav}>
            <p className="font-medium text-[#101828]">{storeCell.name}</p>
            <p className="text-[11px] text-[#667085]">#{storeCell.storeId}</p>
          </Link>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[#344054]">{privilege}</td>
      <td className="whitespace-nowrap px-3 py-2 text-[#344054]">{origin}</td>
      <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-[#475467]">
        {formatAdminLiteDateTime(user.lastSignInAt, "ko-KR", emptyCell)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-[#475467]">
        {formatAdminLiteDate(user.joinedAt, "ko-KR", emptyCell)}
      </td>
      <td className="whitespace-nowrap px-3 py-2" onClick={stopRowNav}>
        <button type="button" className={ADMIN_USERS_LITE_TABLE_ACTION} onClick={handleViewDetail}>
          {MEMBER_LIST_DETAIL_ACTION_KO}
        </button>
      </td>
    </tr>
  );
});

AdminUserTableRow.displayName = "AdminUserTableRow";

export const AdminUserTable = forwardRef<HTMLDivElement, AdminUserTableProps>(function AdminUserTable(
  {
    users,
    queryScopeKey,
    totalItems,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onViewDetail,
    onHorizontalScroll,
  },
  ref,
) {
  const policy = MEMBER_ENTITY_ACTION_POLICY;
  const selectableIds = users.map((u) => u.id);
  const selection = useAdminManagementSelection({ queryScopeKey, selectableIds });
  const tableMinWidth = computeTableMinWidthPx([
    "SELECTION",
    "TITLE",
    "IDENTITY",
    "METADATA",
    "STATUS",
    "METADATA",
    "METADATA",
    "METADATA",
    "METADATA",
    "DATE",
    "DATE",
    "ACTIONS",
  ] as ManagementColumnKind[]);

  return (
    <AdminManagementTableViewport
      viewportRef={ref}
      onHorizontalScroll={onHorizontalScroll}
      className="rounded-lg border-[#e4e7ec]"
    >
      <AdminManagementBulkBar
        selectedCount={selection.selectedCount}
        policy={policy}
        selectedLabel={`현재 페이지 ${selection.selectedCount}개 선택`}
        actions={[]}
        emptyActionsHint="목록 bulk 삭제 없음 · 삭제 요청 또는 회원 상세에서 처리"
      />
      <table
        className="w-full border-collapse text-[13px]"
        style={{ minWidth: tableMinWidth }}
        data-admin-mgmt-table-min-width={String(tableMinWidth)}
      >
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-[#eaecf0] bg-[#f8fafc] text-left text-[11px] font-semibold uppercase tracking-wide text-[#475467]">
            <th className="px-3 py-2" style={managementColumnStyle("SELECTION")}>
              <AdminManagementSelectionCheckbox
                role="header"
                state={selection.headerState}
                onToggle={selection.toggleAll}
                aria-label="현재 페이지 전체 선택"
              />
            </th>
            <th className="px-3 py-2" style={managementColumnStyle("TITLE")}>
              회원
            </th>
            <th className="px-3 py-2">회원 ID</th>
            <th className="px-3 py-2">연락처</th>
            <th className="px-3 py-2">계정 상태</th>
            <th className="px-3 py-2">인증</th>
            <th className="px-3 py-2">매장</th>
            <th className="px-3 py-2">관리 권한</th>
            <th className="px-3 py-2">가입 방식</th>
            <th className="px-3 py-2">최근 로그인</th>
            <th className="px-3 py-2">가입일</th>
            <th className="px-3 py-2">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <AdminUserTableRow
              key={u.id}
              user={u}
              onViewDetail={onViewDetail}
              selected={selection.isSelected(u.id)}
              onToggleSelected={() => selection.toggleRow(u.id)}
            />
          ))}
        </tbody>
      </table>
      <AdminUserListPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </AdminManagementTableViewport>
  );
});
