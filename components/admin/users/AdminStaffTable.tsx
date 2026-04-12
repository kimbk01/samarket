"use client";

import type { AdminStaff } from "@/lib/types/admin-staff";
import { getRoleLabel } from "@/lib/admin-users/mock-admin-staff";
import { getPermissionLabel } from "@/lib/admin-users/admin-permissions";

interface AdminStaffTableProps {
  staffList: AdminStaff[];
  /** 최고관리자일 때만 수정 버튼 노출 */
  isMaster?: boolean;
  onEdit?: (staffId: string) => void;
}

export function AdminStaffTable({ staffList, isMaster, onEdit }: AdminStaffTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">로그인 ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">이름</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">역할</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">권한</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">생성일</th>
            {isMaster && onEdit && (
              <th className="w-[72px] px-3 py-2.5 text-right font-medium text-sam-fg">관리</th>
            )}
          </tr>
        </thead>
        <tbody>
          {staffList.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{s.loginId}</td>
              <td className="px-3 py-2.5 text-sam-fg">{s.displayName}</td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-[13px] text-sam-fg">
                  {getRoleLabel(s.role)}
                </span>
              </td>
              <td className="max-w-[280px] px-3 py-2.5 text-[13px] text-sam-muted">
                <span className="line-clamp-2">
                  {s.permissions.length === 0
                    ? "-"
                    : `${s.permissions.slice(0, 5).map(getPermissionLabel).join(", ")}${s.permissions.length > 5 ? ` 외 ${s.permissions.length - 5}개` : ""}`}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(s.createdAt).toLocaleDateString("ko-KR")}
              </td>
              {isMaster && onEdit && (
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(s.id)}
                    className="rounded border border-sam-border px-2 py-1 text-[13px] text-sam-fg hover:bg-sam-surface-muted"
                  >
                    수정
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
