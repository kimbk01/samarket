"use client";

import Link from "next/link";
import { memo, useCallback } from "react";
import type { AdminUser } from "@/lib/types/admin-user";
import { AdminModerationStatusBadge } from "@/components/admin/AdminModerationStatusBadge";

const MEMBER_TYPE_LABELS: Record<AdminUser["memberType"], string> = {
  normal: "일반",
  premium: "특별",
  admin: "관리자",
};

interface AdminUserTableProps {
  users: AdminUser[];
  onEditMember: (user: AdminUser) => void;
  /** false(기본): UUID 열 숨김 */
  showMemberUuid?: boolean;
}

const AdminUserTableRow = memo(function AdminUserTableRow({
  user: u,
  showMemberUuid,
  onEditMember,
}: {
  user: AdminUser;
  showMemberUuid: boolean;
  onEditMember: (user: AdminUser) => void;
}) {
  const handleCopyLogin = useCallback(() => {
    if (!u.loginUsername) return;
    void navigator.clipboard.writeText(u.loginUsername).catch(() => {});
  }, [u.loginUsername]);

  const handleCopyUuid = useCallback(() => {
    void navigator.clipboard.writeText(u.id).catch(() => {});
  }, [u.id]);

  const handleEdit = useCallback(() => {
    onEditMember(u);
  }, [onEditMember, u]);

  return (
    <tr className="border-b border-sam-border-soft hover:bg-sam-app">
      <td className="px-3 py-2.5">
        <span className="font-mono text-[13px] font-semibold text-sam-fg">{u.loginUsername ?? "—"}</span>
        {u.loginUsername ?
          <button
            type="button"
            className="ml-2 align-baseline text-[12px] font-medium text-signature hover:underline"
            onClick={handleCopyLogin}
          >
            복사
          </button>
        : null}
        {!showMemberUuid ?
          <Link
            href={`/admin/users/${u.id}`}
            className="ml-2 align-baseline text-[12px] font-medium text-signature hover:underline"
          >
            상세
          </Link>
        : null}
      </td>
      {showMemberUuid ?
        <td className="max-w-[240px] px-3 py-2.5 align-top">
          <p className="break-all font-mono text-[11px] leading-snug text-sam-fg">{u.id}</p>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            <Link
              href={`/admin/users/${u.id}`}
              className="text-[12px] font-medium text-signature hover:underline"
            >
              상세
            </Link>
            <button
              type="button"
              className="text-[12px] font-medium text-signature hover:underline"
              onClick={handleCopyUuid}
            >
              UUID 복사
            </button>
          </div>
        </td>
      : null}
      <td className="px-3 py-2.5 text-sam-fg">{u.nickname}</td>
      <td className="px-3 py-2.5 text-sam-fg">{MEMBER_TYPE_LABELS[u.memberType]}</td>
      <td className="px-3 py-2.5 text-[12px]">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            u.phoneVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {u.phoneVerified ? "완료" : u.verificationStatus === "pending" ? "대기" : "미인증"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <AdminModerationStatusBadge status={u.moderationStatus} />
      </td>
      <td className="max-w-[min(280px,32vw)] truncate px-3 py-2.5 text-sam-muted" title={u.location ?? undefined}>
        {u.location?.trim() ? u.location : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <p className="font-semibold text-sky-700">{(u.pointBalance ?? 0).toLocaleString()}P</p>
        <Link
          href={`/admin/users/${u.id}?tab=points`}
          className="text-[11px] text-sam-meta hover:text-sky-600 hover:underline"
        >
          내역
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-muted">
        {u.productCount} / {u.soldCount}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-muted">{u.reportCount}</td>
      <td className="whitespace-nowrap px-3 py-2.5 align-top">
        <button
          type="button"
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 text-[12px] font-semibold text-signature shadow-sm hover:bg-sam-app"
          onClick={handleEdit}
        >
          수정
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
        {new Date(u.joinedAt).toLocaleDateString("ko-KR")}
      </td>
    </tr>
  );
});

AdminUserTableRow.displayName = "AdminUserTableRow";

export function AdminUserTable({ users, onEditMember, showMemberUuid = false }: AdminUserTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table
        className={`w-full border-collapse text-[14px] ${showMemberUuid ? "min-w-[980px]" : "min-w-[720px]"}`}
      >
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">로그인 아이디</th>
            {showMemberUuid ?
              <th className="min-w-[200px] px-3 py-2.5 text-left font-medium text-sam-fg">회원 UUID</th>
            : null}
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">닉네임</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">구분</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">전화 인증</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">지역</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">포인트</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">상품/판매</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">신고</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">작업</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">가입일</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <AdminUserTableRow key={u.id} user={u} showMemberUuid={showMemberUuid} onEditMember={onEditMember} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
