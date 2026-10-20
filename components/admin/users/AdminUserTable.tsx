"use client";

import { forwardRef, memo, useCallback } from "react";
import Link from "next/link";
import { adminMemberNicknameSecondary } from "@/lib/admin-users/admin-member-identity";
import {
  MEMBER_LIST_AT_ID_COLUMN_KO,
  MEMBER_LIST_DETAIL_ACTION_KO,
  MEMBER_LIST_STORE_NONE_KO,
  memberListAccountStateLabelKo,
  memberListPrivilegeLabelKo,
  memberListSignupOriginLabelKo,
  memberListStoreCellLabel,
  memberListVerificationLabelKo,
} from "@/lib/admin-users/member-list-presentation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminUserListPagination } from "./AdminUserListPagination";
import { AdminUserProviderIcon } from "./AdminUserProviderIcon";
import { AdminMemberListBulkBar } from "./AdminMemberListBulkBar";
import {
  displayNameForAdminUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  publicIdForAdminUser,
  statusBadgeClass,
  statusCategoryForAdminUser,
} from "./admin-user-lite-display";
import type { AdminAuthProvider, AdminUser } from "@/lib/types/admin-user";
import {
  AdminManagementSelectionCheckbox,
  AdminManagementTableViewport,
  useAdminManagementSelection,
} from "@/components/admin/management";
import {
  computeTableMinWidthPx,
  managementColumnStyle,
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
  onSelectionActionCompleted?: () => void;
  onHorizontalScroll?: React.UIEventHandler<HTMLDivElement>;
}

function stopRowNav(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function resolveProvider(user: AdminUser): AdminAuthProvider {
  const p = String(user.authProvider ?? "").trim().toLowerCase();
  if (p === "kakao" || p === "google" || p === "apple" || p === "email" || p === "manual") return p;
  return "unknown" as AdminAuthProvider;
}

const AdminUserTableRow = memo(function AdminUserTableRow({
  user,
  selected,
  onToggleSelect,
  onViewDetail,
}: {
  user: AdminUser;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onViewDetail: (user: AdminUser) => void;
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
  const verifyLabel = memberListVerificationLabelKo(user);
  const copyId = publicId || user.id;
  const phone = user.phone?.trim() || "";
  const contactEmail = user.email?.trim() || "";
  const provider = resolveProvider(user);

  return (
    <tr
      className="cursor-pointer border-b border-sam-border-soft bg-sam-surface text-[13px] hover:bg-sam-surface-muted"
      onClick={handleViewDetail}
      data-member-list-row="1"
      data-member-status={status}
      data-member-verified={user.phoneVerified === true ? "1" : "0"}
      data-member-selected={selected ? "1" : "0"}
    >
      <td className="px-3 py-2" style={managementColumnStyle("SELECTION")} onClick={stopRowNav}>
        <AdminManagementSelectionCheckbox
          role="row"
          checked={selected}
          onToggle={() => onToggleSelect(user.id)}
          aria-label={`${display} 선택`}
        />
      </td>
      <td className="min-w-[180px] px-3 py-2" style={managementColumnStyle("TITLE")}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-info-soft text-xs font-bold text-sam-info">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-sam-fg">{display}</p>
            {nick ? <p className="truncate text-[12px] text-sam-muted">{nick}</p> : null}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-sam-fg" onClick={stopRowNav}>
        <AdminActionButton
          variant="ghost"
          size="sm"
          className="!px-1 text-left"
          title="@회원 ID 복사"
          data-member-list-at-id="1"
          onClick={() => {
            const value = copyId.startsWith("@") ? copyId.slice(1) : copyId;
            void navigator.clipboard?.writeText(value).catch(() => {});
          }}
        >
          {publicId || emptyCell}
        </AdminActionButton>
      </td>
      <td className="px-3 py-2 text-sam-muted">
        <p>{phone || emptyCell}</p>
        <p className="text-[12px] text-sam-muted">{contactEmail || emptyCell}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] font-semibold ${statusBadgeClass(status)}`}>
          {statusLabel}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sam-fg" data-member-list-verify="1">
        {verifyLabel}
      </td>
      <td className="min-w-[140px] px-3 py-2" onClick={stopRowNav} data-member-list-store="1">
        {storeCell.kind === "none" ? (
          <span className="text-sam-meta">{MEMBER_LIST_STORE_NONE_KO}</span>
        ) : (
          <Link href={storeCell.href!} className="block hover:underline" onClick={stopRowNav}>
            <p className="font-medium text-sam-fg">{storeCell.name}</p>
            <p className="text-[12px] text-sam-muted">#{storeCell.storeId}</p>
          </Link>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sam-fg" data-member-list-privilege="1">
        {privilege}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sam-fg" data-member-list-origin="1">
        <span className="inline-flex items-center gap-1.5">
          <AdminUserProviderIcon provider={provider} />
          <span>{origin}</span>
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-sam-muted">
        {formatAdminLiteDateTime(user.lastSignInAt, "ko-KR", emptyCell)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums text-sam-muted">
        {formatAdminLiteDate(user.joinedAt, "ko-KR", emptyCell)}
      </td>
      <td className="whitespace-nowrap px-3 py-2" onClick={stopRowNav}>
        <AdminActionButton
          variant="ghost"
          size="sm"
          onClick={handleViewDetail}
          data-member-cta-variant="tertiary"
        >
          {MEMBER_LIST_DETAIL_ACTION_KO}
        </AdminActionButton>
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
    onSelectionActionCompleted,
    onHorizontalScroll,
  },
  ref,
) {
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
      className="rounded-ui-rect border-sam-border"
    >
      <AdminMemberListBulkBar
        selectedIds={[...selection.selected]}
        users={users}
        onClear={selection.clear}
        onCompleted={onSelectionActionCompleted}
      />
      <table
        className="w-full border-collapse text-[13px]"
        style={{ minWidth: tableMinWidth }}
        data-admin-mgmt-table-min-width={String(tableMinWidth)}
        data-member-list-table="1"
        data-member-list-selection="1"
      >
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-sam-border-soft bg-sam-surface-muted text-left text-[12px] font-semibold uppercase tracking-wide text-sam-muted">
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
            <th className="px-3 py-2">{MEMBER_LIST_AT_ID_COLUMN_KO}</th>
            <th className="px-3 py-2">연락처</th>
            <th className="px-3 py-2">계정 상태</th>
            <th className="px-3 py-2">인증</th>
            <th className="px-3 py-2">매장</th>
            <th className="px-3 py-2">관리 권한</th>
            <th className="px-3 py-2">가입 방식</th>
            <th className="px-3 py-2">최근 로그인 (PHT)</th>
            <th className="px-3 py-2">가입일 (PHT)</th>
            <th className="px-3 py-2">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <AdminUserTableRow
              key={u.id}
              user={u}
              selected={selection.isSelected(u.id)}
              onToggleSelect={selection.toggleRow}
              onViewDetail={onViewDetail}
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
